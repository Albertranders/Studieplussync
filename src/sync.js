// Pure calendar-planning logic, isolated from network and browser APIs for unit testing.
import "./config.js"; // Load the shared extension defaults.

// Private event properties identify managed lessons and detect content changes.
export const MANAGED_KEY = "studiesyncKey"; // Stable identifier used to find the lesson on the next sync.
export const MANAGED_HASH = "studiesyncHash"; // Content fingerprint used to avoid unnecessary updates.
export const MANAGED_REMINDER = "studiesyncRem"; // "1" når vi selv har sat notifikationer på eventet.
 
// Identify a lesson by its source ID, falling back to a composite key when absent.
export function stableKey(lesson) {
  return String(lesson.id || `${lesson.date}|${lesson.start}|${lesson.subject}`);
}

// Convert a lesson into the event resource expected by the Google Calendar API.
// `overrides` er null (ingen egne notifikationer: kalenderens standard gælder) eller en liste af minutter før start.
export function eventBody(lesson, timeZone = globalThis.STUDIESYNC_CONFIG.timeZone, overrides = null) {
  // Include only available teacher, homework, and note details in the event description.
  const description = [
    lesson.teacher ? `Lærer: ${lesson.teacher}` : "",
    lesson.homework ? `Lektier:\n${lesson.homework}` : "",
    lesson.note ? `Note:\n${lesson.note}` : ""
  ].filter(Boolean).join("\n\n");

  // Color-code events by whether they contain homework or only a note.
  const colorId = lesson.homework ? "9" : lesson.note ? "10" : "5";
  return {
    summary: lesson.subject || "Lektion", // Use the subject as the calendar event title.
    location: lesson.room || "",
    description,
    colorId,
    start: { dateTime: `${lesson.date}T${lesson.start}:00`, timeZone },
    end: { dateTime: `${lesson.date}T${lesson.end}:00`, timeZone },
    // Kun med, når brugeren har slået lektionsnotifikationer til, så andre brugeres fingeraftryk ikke ændres.
    ...(Array.isArray(overrides) ? { reminders: { useDefault: false, overrides: overrides.map(minutes => ({ method: "popup", minutes })) } } : {})
  };
}

// Hvilke lektioner der får notifikationer: alle, eller kun dagens første (tidligste start pr. dato; ved lige start får alle den).
// Returnerer et map nøgle -> liste af minutter (tom liste = ingen notifikation). `reminders` er null (fra) eller { minutes, scope }.
export function lessonOverrides(lessons, reminders) {
  const result = new Map();
  if (!reminders) return result;
  const firstStart = new Map();
  for (const lesson of lessons) {
    if (!firstStart.has(lesson.date) || lesson.start < firstStart.get(lesson.date)) firstStart.set(lesson.date, lesson.start);
  }
  for (const lesson of lessons) {
    const wanted = reminders.scope !== "first" || lesson.start === firstStart.get(lesson.date);
    result.set(stableKey(lesson), wanted ? [...reminders.minutes] : []);
  }
  return result;
}

// Serialize all event fields that should trigger an update.
function contentJson(lesson, timeZone, overrides = null) {
  return JSON.stringify(eventBody(lesson, timeZone, overrides));
}

// Compute a fast 53-bit text hash for change detection.
function cyrb53(text, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// Store a compact fingerprint because Google truncates private-property values over 1024 characters.
export function contentHash(lesson, timeZone, overrides = null) {
  const json = contentJson(lesson, timeZone, overrides);
  return "v2:" + cyrb53(json, 1).toString(16) + cyrb53(json, 2).toString(16);
}

// Accept the legacy full-content hash so existing events are not updated unnecessarily.
function matchesStoredHash(stored, lesson, timeZone, overrides = null) {
  return stored === contentHash(lesson, timeZone, overrides) || stored === contentJson(lesson, timeZone, overrides);
}

// Compare the desired schedule with managed events and produce the required calendar operations.
export function buildPlan(lessons, existing, timeZone = globalThis.STUDIESYNC_CONFIG.timeZone, reminders = null) {
  const plan = { create: [], update: [], delete: [], unchanged: 0 };

  // Keep the first lesson for each stable key to avoid duplicate events.
  const wanted = new Map();
  for (const lesson of lessons) {
    const key = stableKey(lesson);
    if (wanted.has(key)) continue;
    wanted.set(key, lesson);
  }

  // Consider only events carrying our private ownership key.
  const managed = new Map();
  for (const event of existing) {
    const props = event.extendedProperties?.private || {};
    const key = props[MANAGED_KEY];
    if (!key) continue; // Leave personal events untouched.
    if (managed.has(key)) {
      plan.delete.push(event.id); // Remove duplicate events created by this extension.
      continue;
    }
    managed.set(key, event);
  }

  const perLesson = lessonOverrides([...wanted.values()], reminders);
  for (const [key, lesson] of wanted) {
    const old = managed.get(key);
    const overrides = perLesson.has(key) ? perLesson.get(key) : null;
    if (!old) {
      plan.create.push({ key, lesson, overrides }); // Create lessons that have no matching managed event.
      continue;
    }
    const props = old.extendedProperties?.private || {};
    if (!matchesStoredHash(props[MANAGED_HASH], lesson, timeZone, overrides)) {
      // Slås notifikationer fra, skal vores egne på eventet nulstilles; et PATCH uden feltet ville lade dem stå.
      plan.update.push({ id: old.id, key, lesson, overrides, reset: overrides === null && props[MANAGED_REMINDER] === "1" }); // Update the existing event when its content changed.
    } else {
      plan.unchanged += 1; // Skip writes for unchanged lessons.
    }
  }

  // Delete managed events whose lessons are no longer in the fetched schedule.
  for (const [key, event] of managed) {
    if (!wanted.has(key)) plan.delete.push(event.id);
  }
  return plan;
}

// Accept only non-empty schedules whose lessons include dates, times, and subjects.
export function isSafeSchedule(lessons) {
  return Array.isArray(lessons) && lessons.length > 0 &&
    lessons.every(l => l.date && l.start && l.end && l.subject);
}

// Treat a sudden drop below half of at least four existing lessons as a likely extraction failure.
export function isSuspiciousDrop(existingCount, newCount) {
  return existingCount >= 4 && newCount < Math.ceil(existingCount * 0.5);
}
