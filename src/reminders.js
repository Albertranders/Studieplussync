// Kalenderpåmindelser for afleveringer: ren logik, der afgør, hvilke begivenheder der skal oprettes, opdateres
// og slettes. Ingen browser-API'er (kan testes). Begivenhederne ligger i en egen kalender, så de ikke blandes
// med lektionerne.
//
// Pr. aflevering, der mangler:
//  - "Frist": 15 minutter fra fristens klokkeslæt, med påmindelser før (som standard 3 dage, 24 timer og 2 timer).
//  - "Forfalden": en daglig begivenhed hver morgen i op til `nagDays` dage efter fristen. Google Kalender kan kun
//    minde FØR en begivenhed, så de daglige påmindelser er en gentagende begivenhed, der oprettes på forhånd.
// Er afleveringen afleveret, slettes begge. Opgaver uden vores markør røres aldrig.
import { assignmentKey, dueDate } from "./tasks.js";
import { wallTimeToDate } from "./lessons-cache.js";

export const REMINDER_KIND_KEY = "studiesyncKind";      // alle vores begivenheder har værdien "assignment"
export const REMINDER_KIND = "assignment";
export const REMINDER_KEY = "studiesyncAssignment";     // aflevering (se assignmentKey)
export const REMINDER_ROLE = "studiesyncRole";          // "deadline" eller "overdue"
export const EVENT_MINUTES = 15;
export const DEFAULTS = { minutes: [4320, 1440, 120], nagDays: 14, nagHour: 8 };
const MAX_KNOWN = 500;

// Lægger dage til en dato ("ÅÅÅÅ-MM-DD").
export function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const pad = n => String(n).padStart(2, "0");
const clock = (hour, minute) => `${pad(hour)}:${pad(minute)}`;
const normalize = options => ({
  minutes: (Array.isArray(options?.minutes) ? options.minutes : DEFAULTS.minutes).map(Number).filter(n => n >= 0 && n <= 40320).slice(0, 5),
  nagDays: Math.max(1, Math.min(60, Math.round(Number(options?.nagDays) || DEFAULTS.nagDays))),
  nagHour: Math.max(0, Math.min(23, Math.round(Number(options?.nagHour ?? DEFAULTS.nagHour))))
});
const overrides = minutes => minutes.map(m => ({ method: "popup", minutes: m }));
const title = item => (item.subject ? `${item.subject}: ${item.title}` : item.title).slice(0, 180);
const privateProps = (key, role) => ({ [REMINDER_KIND_KEY]: REMINDER_KIND, [REMINDER_KEY]: key, [REMINDER_ROLE]: role });

// Første morgen, den daglige påmindelse kan komme: dagen efter fristen kl. nagHour. Er det allerede
// overstået (fristen er passeret), bliver det næste kommende kl. nagHour.
export function firstNagStart(item, timeZone, now, nagHour) {
  const first = addDays(dueDate(item.due, timeZone), 1);
  let date = first, at = wallTimeToDate(date, clock(nagHour, 0), timeZone);
  if (at.getTime() <= now) {
    date = dueDate(new Date(now).toISOString(), timeZone);
    at = wallTimeToDate(date, clock(nagHour, 0), timeZone);
    if (at.getTime() <= now) { date = addDays(date, 1); at = wallTimeToDate(date, clock(nagHour, 0), timeZone); }
  }
  return { date, at, firstDate: first, firstAt: wallTimeToDate(first, clock(nagHour, 0), timeZone) };
}

// Begivenheden ved fristen: starter på fristens klokkeslæt, så påmindelserne kommer præcis før fristen.
export function deadlineEvent(item, timeZone, options) {
  const { minutes } = normalize(options);
  const start = new Date(item.due), end = new Date(start.getTime() + EVENT_MINUTES * 60000);
  return {
    summary: `Frist: ${title(item)}`,
    description: "Aflevering fra Studie+ (StudieSync). Begivenheden slettes automatisk, når du har afleveret.",
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    transparency: "transparent", // viser ikke den tid som optaget
    reminders: { useDefault: false, overrides: overrides(minutes) },
    extendedProperties: { private: privateProps(assignmentKey(item), "deadline") }
  };
}

// Den daglige "Forfalden"-påmindelse: gentages hver morgen i nagDays dage og giver besked, når den starter.
export function overdueEvent(item, timeZone, now, options) {
  const { nagDays, nagHour } = normalize(options);
  const { date } = firstNagStart(item, timeZone, now, nagHour);
  return {
    summary: `Forfalden: ${title(item)}`,
    description: `Du har endnu ikke afleveret. Du får en påmindelse hver morgen i op til ${nagDays} dage, eller til du har afleveret.`,
    start: { dateTime: `${date}T${clock(nagHour, 0)}:00`, timeZone },
    end: { dateTime: `${date}T${clock(nagHour, EVENT_MINUTES)}:00`, timeZone },
    recurrence: [`RRULE:FREQ=DAILY;COUNT=${nagDays}`],
    transparency: "transparent",
    reminders: { useDefault: false, overrides: overrides([0]) },
    extendedProperties: { private: privateProps(assignmentKey(item), "overdue") }
  };
}

// Nøgle -> begivenheds-id for dem, vi har oprettet; højst MAX_KNOWN, de ældste glemmes først.
export function rememberRefs(known, created, removed = []) {
  const merged = { ...(known || {}) };
  for (const ref of removed) delete merged[ref];
  for (const [ref, id] of Object.entries(created || {})) { delete merged[ref]; merged[ref] = id; }
  const keys = Object.keys(merged);
  for (const ref of keys.slice(0, Math.max(0, keys.length - MAX_KNOWN))) delete merged[ref];
  return merged;
}

const sameOverrides = (event, minutes) => {
  const have = (event.reminders?.overrides || []).map(o => `${o.method}:${o.minutes}`).join(",");
  return event.reminders?.useDefault === false && have === minutes.map(m => `popup:${m}`).join(",");
};
const sameInstant = (a, b) => new Date(a).getTime() === new Date(b).getTime();

// Sammenligner de afleveringer, der mangler, med begivenhederne i vores kalender.
// - `open`: afleveringer, der ikke er afleveret (med fag, titel, frist og start)
// - `existing`: vores begivenheder i kalenderen (gentagende serier kun som én)
// - `known`: begivenheder, vi selv har oprettet (ref -> id). En kendt begivenhed, der er væk, er slettet af brugeren
//   og oprettes ikke igen.
// - `now`: tidspunkt i millisekunder
export function planReminders({ open, existing, known = {}, timeZone, now = Date.now(), options }) {
  const opts = normalize(options);
  const plan = { create: [], update: [], delete: [], skipped: 0, unchanged: 0 };
  const byRef = new Map(), extras = [];
  for (const event of existing || []) {
    const props = event.extendedProperties?.private;
    if (props?.[REMINDER_KIND_KEY] !== REMINDER_KIND || !props[REMINDER_KEY] || !props[REMINDER_ROLE]) continue; // ikke vores
    const ref = `${props[REMINDER_KEY]}:${props[REMINDER_ROLE]}`;
    if (byRef.has(ref)) extras.push({ id: event.id, ref }); else byRef.set(ref, event);
  }
  const wanted = new Set();
  const consider = (ref, event, build, patchFor, canCreate) => {
    wanted.add(ref);
    if (!event) {
      if (!canCreate) plan.unchanged++;
      else if (known[ref]) plan.skipped++; // brugeren har slettet den
      else plan.create.push({ ref, body: build() });
      return;
    }
    const patch = patchFor(event);
    if (patch) plan.update.push({ id: event.id, ref, body: patch }); else plan.unchanged++;
  };
  for (const item of open || []) {
    const key = assignmentKey(item);
    if (wanted.has(`${key}:deadline`)) continue; // to ens afleveringer giver ét sæt begivenheder
    const due = new Date(item.due).getTime();
    // Fristen: oprettes kun, mens den ligger i fremtiden; en eksisterende, passeret begivenhed beholdes uændret.
    consider(`${key}:deadline`, byRef.get(`${key}:deadline`), () => deadlineEvent(item, timeZone, opts), event => {
      if (due <= now) return null;
      const want = deadlineEvent(item, timeZone, opts);
      const same = event.summary === want.summary && sameInstant(event.start?.dateTime, want.start.dateTime) && sameOverrides(event, opts.minutes);
      return same ? null : want;
    }, due > now);
    // Den daglige påmindelse oprettes med det samme, så den virker, selv når browseren ikke er åben efter fristen.
    consider(`${key}:overdue`, byRef.get(`${key}:overdue`), () => overdueEvent(item, timeZone, now, opts), event => {
      const want = overdueEvent(item, timeZone, now, opts);
      const patch = {};
      if (event.summary !== want.summary) patch.summary = want.summary;
      if (JSON.stringify(event.recurrence || []) !== JSON.stringify(want.recurrence)) patch.recurrence = want.recurrence;
      if (!sameOverrides(event, [0])) patch.reminders = want.reminders;
      // Startdagen flyttes kun, mens serien ikke er begyndt (fx hvis fristen er flyttet); ellers ville den skifte hver dag.
      const { firstAt } = firstNagStart(item, timeZone, now, opts.nagHour);
      if (firstAt.getTime() > now && !sameInstant(event.start?.dateTime, firstAt)) { patch.start = want.start; patch.end = want.end; }
      return Object.keys(patch).length ? patch : null;
    }, true);
  }
  for (const [ref, event] of byRef) if (!wanted.has(ref)) plan.delete.push({ id: event.id, ref });
  plan.delete.push(...extras);
  return plan;
}
