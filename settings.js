// Brugerens indstillinger fra menuen "Indstillinger". Ren logik uden browser-API'er (kan testes med `npm test`).
// Standardværdierne står i config.js. Det brugeren vælger i popup'en gemmes i chrome.storage.local
// og vinder over config.js.

// Valgmuligheder i rullemenuerne
export const WEEK_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12];
export const INTERVAL_CHOICES = [15, 30, 60, 120];
// Udseende: "auto" følger browserens/systemets lyse eller mørke tema (det samme som Google bruger)
export const THEME_CHOICES = [["auto", "Automatisk"], ["light", "Lys"], ["dark", "Mørk"]];

// Tidszonens forskydning fra UTC i minutter på et givet tidspunkt (tager højde for sommertid)
export function timeZoneOffsetMinutes(zone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"
  }).formatToParts(date);
  const get = type => Number(parts.find(p => p.type === type).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// "GMT", "GMT+1", "GMT-5", "GMT+5:30"
export function formatOffset(minutes) {
  if (!minutes) return "GMT";
  const abs = Math.abs(minutes);
  const m = abs % 60;
  return `GMT${minutes < 0 ? "-" : "+"}${Math.floor(abs / 60)}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

// Rullemenuens tekst, fx "(GMT+1) Europe/Copenhagen"
export function timeZoneLabel(zone, date = new Date()) {
  return `(${formatOffset(timeZoneOffsetMinutes(zone, date))}) ${zone.replaceAll("_", " ")}`;
}

// Tidszonerne som [navn, tekst], sorteret efter forskydning og derefter navn
export function timeZoneOptions(zones, date = new Date()) {
  return zones
    .map(zone => ({ zone, offset: timeZoneOffsetMinutes(zone, date) }))
    .sort((a, b) => a.offset - b.offset || a.zone.localeCompare(b.zone))
    .map(({ zone }) => [zone, timeZoneLabel(zone, date)]);
}

// Lægger de gemte valg oven på standardværdierne fra config.js og retter ugyldige værdier.
// `stored` = rå værdier fra chrome.storage.local, `defaults` = globalThis.STUDIESYNC_CONFIG.
export function resolveSettings(stored = {}, defaults = {}) {
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultTimeZone = defaults.timeZone || browserTimeZone || "Europe/Copenhagen";
  const candidateTimeZone = typeof stored.timeZone === "string" && stored.timeZone ? stored.timeZone : defaultTimeZone;
  let timeZone = defaultTimeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidateTimeZone });
    timeZone = candidateTimeZone;
  } catch {
    // Ugyldig tidszone: brug browserens standard.
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
    autoSyncMinutes: minutes >= 1 ? minutes : defaultMinutes,
    timeZone,
    theme: THEME_CHOICES.some(([id]) => id === stored.theme) ? stored.theme : "auto",
    calendarName: (name || String(defaults.calendarName || "Studie+ skema")).slice(0, 100)
  };
}

// Teksten under hovedknappen, fx "Automatisk synkronisering kører hvert 30. minut, mens browseren er åben."
export function autoSyncText(settings) {
  if (!settings.autoSync) return "Automatisk synkronisering er slået fra.";
  const m = settings.autoSyncMinutes;
  const every = m === 1 ? "hvert minut" : m === 60 ? "hver time" : `hvert ${m}. minut`;
  return `Automatisk synkronisering kører ${every}, mens browseren er åben.`;
}
