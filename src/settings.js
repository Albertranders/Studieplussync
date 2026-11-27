// Pure settings logic for the popup, with no browser APIs so it can be tested independently.
// Defaults come from config.js; saved user choices override those defaults.

// Available values for the settings dropdowns.
export const WEEK_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12];
export const INTERVAL_CHOICES = [15, 30, 60, 120];
// Påmindelser: hvor mange minutter før en begivenhed, man kan få besked. Google Kalender tillader højst 5 pr. begivenhed.
export const REMINDER_CHOICES = [15, 30, 60, 120, 360, 720, 1440, 2880, 4320, 10080];
export const MAX_REMINDERS = 5;
export const DEFAULT_ASSIGNMENT_REMINDERS = [4320, 1440, 120]; // 3 dage, 24 timer og 2 timer før fristen
export const LESSON_REMINDER_CHOICES = [5, 10, 15, 30, 60, 120, 720, 1440];
export const DEFAULT_LESSON_REMINDERS = [15];
export const LESSON_SCOPES = ["first", "all"]; // kun dagens første lektion, eller alle
export const NAG_DAY_CHOICES = [3, 7, 14, 30];
export const NAG_HOUR_CHOICES = [6, 7, 8, 9, 10, 12, 15, 18, 20];
// "Auto" follows the browser or system light/dark appearance.
export const THEME_CHOICES = [["auto", "Automatisk"], ["light", "Lys"], ["dark", "Mørk"]];

// Gør en gemt liste af påmindelser gyldig: hele minutter fra 0 til 4 uger, uden dubletter, længst tid først, højst 5.
// Er intet gemt (ikke en liste), bruges standarden; en tom liste er et gyldigt valg ("ingen påmindelser").
export function normalizeReminderMinutes(value, fallback = DEFAULT_ASSIGNMENT_REMINDERS) {
  if (!Array.isArray(value)) return [...fallback];
  const valid = value.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 40320);
  return [...new Set(valid)].sort((a, b) => b - a).slice(0, MAX_REMINDERS);
}
// "15 min.", "2 timer", "24 timer", "3 dage", "1 uge".
export function reminderLabel(minutes) {
  if (minutes === 0) return "Ved start";
  if (minutes % 10080 === 0) return minutes === 10080 ? "1 uge" : `${minutes / 10080} uger`;
  if (minutes >= 2880 && minutes % 1440 === 0) return `${minutes / 1440} dage`;
  if (minutes % 60 === 0) return minutes === 60 ? "1 time" : `${minutes / 60} timer`;
  return `${minutes} min.`;
}
const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && value !== null && value !== "" && value !== undefined ? Math.max(min, Math.min(max, n)) : fallback;
};

// Return the zone's UTC offset at a specific instant, including daylight-saving changes.
export function timeZoneOffsetMinutes(zone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"
  }).formatToParts(date);
  const get = type => Number(parts.find(p => p.type === type).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// Format an offset as a compact GMT label.
export function formatOffset(minutes) {
  if (!minutes) return "GMT";
  const abs = Math.abs(minutes);
  const m = abs % 60;
  return `GMT${minutes < 0 ? "-" : "+"}${Math.floor(abs / 60)}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

// Build the label displayed for a time-zone option.
export function timeZoneLabel(zone, date = new Date()) {
  return `(${formatOffset(timeZoneOffsetMinutes(zone, date))}) ${zone.replaceAll("_", " ")}`;
}

// Return labeled time zones ordered by UTC offset and then zone name.
export function timeZoneOptions(zones, date = new Date()) {
  // Forskydningen beregnes kun én gang pr. zone (det er den dyre del, ca. 400 zoner i alt).
  return zones
    .map(zone => ({ zone, offset: timeZoneOffsetMinutes(zone, date) }))
    .sort((a, b) => a.offset - b.offset || a.zone.localeCompare(b.zone))
    .map(({ zone, offset }) => [zone, `(${formatOffset(offset)}) ${zone.replaceAll("_", " ")}`]);
}

// Merge saved choices with defaults and replace invalid stored values with safe defaults.
// `stored` contains raw storage values; `defaults` is the extension configuration.
export function resolveSettings(stored = {}, defaults = {}) {
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultTimeZone = defaults.timeZone || browserTimeZone || "Europe/Copenhagen";
  const candidateTimeZone = typeof stored.timeZone === "string" && stored.timeZone ? stored.timeZone : defaultTimeZone;
  let timeZone = defaultTimeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidateTimeZone });
    timeZone = candidateTimeZone;
  } catch {
    // An invalid zone falls back to the configured browser-default zone.
  }
  const maxWeeks = Math.max(1, Number(defaults.maxWeeks) || 12);
  const defaultWeeks = Math.max(1, Math.min(maxWeeks, Number(defaults.defaultWeeks) || 4));
  const defaultMinutes = Math.max(1, Math.round(Number(defaults.autoSyncMinutes) || 30));
  const weeks = Math.round(Number(stored.scheduleWeeks));
  const minutes = Math.round(Number(stored.autoSyncMinutes));
  const name = typeof stored.calendarName === "string" ? stored.calendarName.trim() : "";
  return {
    scheduleWeeks: weeks >= 1 ? Math.min(maxWeeks, weeks) : defaultWeeks,
    autoSync: stored.autoSync !== false,
    tasksSync: stored.tasksSync === true, // slået fra som standard; kræver ekstra Google-tilladelse
    assignmentReminders: stored.assignmentReminders === true, // påmindelser om afleveringer i en egen kalender; slået fra som standard
    hideReminderCalendar: stored.hideReminderCalendar !== false, // afleveringskalenderen er skjult som standard
    assignmentReminderMinutes: normalizeReminderMinutes(stored.assignmentReminderMinutes),
    assignmentNag: stored.assignmentNag !== false, // daglig påmindelse efter en overskredet frist
    assignmentNagDays: clampInt(stored.assignmentNagDays, 1, 60, 14),
    assignmentNagHour: clampInt(stored.assignmentNagHour, 0, 23, 8),
    lessonReminders: stored.lessonReminders === true, // notifikationer for lektioner; slået fra som standard
    lessonReminderMinutes: normalizeReminderMinutes(stored.lessonReminderMinutes, DEFAULT_LESSON_REMINDERS),
    lessonReminderScope: LESSON_SCOPES.includes(stored.lessonReminderScope) ? stored.lessonReminderScope : "first",
    autoSyncMinutes: minutes >= 1 ? minutes : defaultMinutes,
    timeZone,
    theme: THEME_CHOICES.some(([id]) => id === stored.theme) ? stored.theme : "auto",
    calendarName: (name || String(defaults.calendarName || "Studie+ skema")).slice(0, 100)
  };
}

// Describe the configured automatic-sync interval beneath the main action button.
export function autoSyncText(settings) {
  if (!settings.autoSync) return "Automatisk synkronisering er slået fra.";
  const m = settings.autoSyncMinutes;
  const every = m === 1 ? "hvert minut" : m === 60 ? "hver time" : `hvert ${m}. minut`;
  return `Automatisk ${every}.`;
}
