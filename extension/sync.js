export const MANAGED_KEY = "studiesyncKey";
export const MANAGED_HASH = "studiesyncHash";
export const TIME_ZONE = "Europe/Copenhagen";

export function stableKey(lesson) {
  return String(lesson.id || `${lesson.date}|${lesson.start}|${lesson.subject}`);
}

export function eventBody(lesson) {
  const description = [
    lesson.teacher ? `Lærer: ${lesson.teacher}` : "",
    lesson.homework ? `Lektier:\n${lesson.homework}` : "",
    lesson.note ? `Note:\n${lesson.note}` : ""
  ].filter(Boolean).join("\n\n");

  const colorId = lesson.homework ? "9" : lesson.note ? "10" : "5";
  return {
    summary: lesson.subject || "Lektion",
    location: lesson.room || "",
    description,
    colorId,
    start: { dateTime: `${lesson.date}T${lesson.start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${lesson.date}T${lesson.end}:00`, timeZone: TIME_ZONE }
  };
}

export function contentHash(lesson) {
  const body = eventBody(lesson);
  return JSON.stringify(body);
}

export function buildPlan(lessons, existing) {
  const plan = { create: [], update: [], delete: [], unchanged: 0 };
  const wanted = new Map();
  for (const lesson of lessons) {
    const key = stableKey(lesson);
    if (wanted.has(key)) continue;
    wanted.set(key, lesson);
  }

  const managed = new Map();
  for (const event of existing) {
    const props = event.extendedProperties?.private || {};
    const key = props[MANAGED_KEY];
    if (!key) continue;
    if (managed.has(key)) {
      plan.delete.push(event.id);
      continue;
    }
    managed.set(key, event);
  }

  for (const [key, lesson] of wanted) {
    const old = managed.get(key);
    if (!old) {
      plan.create.push({ key, lesson });
      continue;
    }
    const hash = contentHash(lesson);
    if (old.extendedProperties?.private?.[MANAGED_HASH] !== hash) {
      plan.update.push({ id: old.id, key, lesson });
    } else {
      plan.unchanged += 1;
    }
  }

  for (const [key, event] of managed) {
    if (!wanted.has(key)) plan.delete.push(event.id);
  }
  return plan;
}

export function isSafeSchedule(lessons) {
  return Array.isArray(lessons) && lessons.length > 0 &&
    lessons.every(l => l.date && l.start && l.end && l.subject);
}
