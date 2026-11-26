// Pure settings logic for the popup, with no browser APIs so it can be tested independently.
// Defaults come from config.js; saved user choices override those defaults.

// Available values for the settings dropdowns.
export const WEEK_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12];
export const INTERVAL_CHOICES = [15, 30, 60, 120];
// "Auto" follows the browser or system light/dark appearance.
export const THEME_CHOICES = [["auto", "Automatisk"], ["light", "Lys"], ["dark", "Mørk"]];

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
