// Lokal kopi af det senest synkroniserede skema, så popup'en kan vise dagens lektioner
// øjeblikkeligt uden at spørge Google Kalender. Ren logik uden browser-API'er (kan testes).
import { timeZoneOffsetMinutes } from "./settings.js";

const MAX_LESSONS = 800; // rigeligt til 12 uger og holder lageret småt

// Gem kun det, dashboardet skal bruge: dato, tider, fag og lokale.
export function buildLessonsCache(lessons, timeZone, now = new Date()) {
  const items = (Array.isArray(lessons) ? lessons : [])
    .filter(l => l && l.date && l.start && l.end && l.subject)
    .slice(0, MAX_LESSONS)
    .map(l => ({
      date: String(l.date), start: String(l.start), end: String(l.end),
      subject: String(l.subject).slice(0, 120), room: String(l.room || "").slice(0, 60)
    }));
  return { at: now.toISOString(), timeZone, lessons: items };
}

// Omsæt "ÅÅÅÅ-MM-DD" + "TT:MM" i en given tidszone til det præcise tidspunkt.
// To gennemløb giver det rigtige svar, også omkring sommer- og vintertid.
export function wallTimeToDate(date, time, timeZone) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let ts = wall - timeZoneOffsetMinutes(timeZone, new Date(wall)) * 60000;
  ts = wall - timeZoneOffsetMinutes(timeZone, new Date(ts)) * 60000;
  return new Date(ts);
}

// Dagens lektioner (hele dagen) i samme form som dashboardet tidligere fik fra Google.
// Returnerer null, hvis der ikke findes en brugbar cache (så kan kaldet falde tilbage).
export function todayLessons(cache, now = new Date()) {
  if (!cache || !Array.isArray(cache.lessons) || typeof cache.timeZone !== "string") return null;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const result = [];
  try {
    for (const l of cache.lessons) {
      const start = wallTimeToDate(l.date, l.start, cache.timeZone);
      const end = wallTimeToDate(l.date, l.end, cache.timeZone);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (start >= dayStart && start < dayEnd) {
        result.push({ summary: l.subject, start: start.toISOString(), end: end.toISOString(), location: l.room || "" });
      }
    }
  } catch {
    return null; // ugyldig tidszone eller beskadiget cache
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}
