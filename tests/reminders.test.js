import test from "node:test";
import assert from "node:assert/strict";
import { addDays, deadlineEvent, firstNagStart, overdueEvent, planReminders, rememberRefs } from "../src/reminders.js";
import { assignmentKey } from "../src/tasks.js";

const TZ = "Europe/Copenhagen";
const NOW = new Date("2026-11-26T07:30:00.000Z").getTime();        // torsdag 26. nov. 2026 kl. 08.30 lokal tid
const item = (title, due = "2026-12-06T21:00:00.000Z") => ({ subject: "Fysik", title, due, start: "2026-11-24T07:00:00.000Z" });
// En begivenhed, som Google returnerer den (med id).
const remote = (event, id) => ({ id, ...structuredClone(event) });
const plan = (open, existing = [], known = {}) => planReminders({ open, existing, known, timeZone: TZ, now: NOW });

test("fristen er 15 minutter lang fra fristens klokkeslæt, med påmindelser 3 dage, 24 timer og 2 timer før", () => {
  const event = deadlineEvent(item("Forsøg"), TZ);
  assert.equal(event.summary, "Frist: Fysik: Forsøg");
  assert.equal(event.start.dateTime, "2026-12-06T21:00:00.000Z");
  assert.equal(event.end.dateTime, "2026-12-06T21:15:00.000Z");
  assert.equal(event.start.timeZone, TZ);
  assert.deepEqual(event.reminders, { useDefault: false, overrides: [
    { method: "popup", minutes: 4320 }, { method: "popup", minutes: 1440 }, { method: "popup", minutes: 120 }] });
  assert.equal(event.extendedProperties.private.studiesyncAssignment, assignmentKey(item("Forsøg")));
});

test("den daglige påmindelse starter morgenen efter fristen og gentages i 14 dage", () => {
  const event = overdueEvent(item("Forsøg"), TZ, NOW);
  assert.equal(event.summary, "Forfalden: Fysik: Forsøg");
  assert.equal(event.start.dateTime, "2026-12-07T08:00:00");
  assert.equal(event.end.dateTime, "2026-12-07T08:15:00");
  assert.deepEqual(event.recurrence, ["RRULE:FREQ=DAILY;COUNT=14"]);
  assert.deepEqual(event.reminders.overrides, [{ method: "popup", minutes: 0 }]);
});

test("er fristen allerede passeret, starter de daglige påmindelser næste kommende morgen", () => {
  const past = item("Forsinket", "2026-11-25T22:55:00.000Z");                 // frist onsdag kl. 23.55 lokal tid
  assert.equal(overdueEvent(past, TZ, NOW).start.dateTime, "2026-11-27T08:00:00"); // i dag kl. 8 er allerede gået
  const earlier = new Date("2026-11-26T05:00:00.000Z").getTime();             // kl. 06.00 lokal tid
  assert.equal(overdueEvent(past, TZ, earlier).start.dateTime, "2026-11-26T08:00:00");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.ok(firstNagStart(past, TZ, NOW, 8).at.getTime() > NOW);
});

test("nye afleveringer får to begivenheder; én der er passeret får kun den daglige", () => {
  const p = plan([item("Ny"), item("Passeret", "2026-11-25T22:55:00.000Z")]);
  assert.deepEqual(p.create.map(j => j.ref.split(":")[1]).sort(), ["deadline", "overdue", "overdue"]);
  assert.equal(p.create.filter(j => j.ref.endsWith(":deadline")).length, 1);
});

test("uændrede begivenheder røres ikke", () => {
  const a = item("Ét");
  const existing = [remote(deadlineEvent(a, TZ), "d1"), remote(overdueEvent(a, TZ, NOW), "o1")];
  const p = plan([a], existing);
  assert.deepEqual([p.create.length, p.update.length, p.delete.length, p.unchanged], [0, 0, 0, 2]);
});

test("en aflevering, der er afleveret, får begge begivenheder slettet", () => {
  const a = item("Afleveret");
  const existing = [remote(deadlineEvent(a, TZ), "d1"), remote(overdueEvent(a, TZ, NOW), "o1")];
  const p = plan([], existing);
  assert.deepEqual(p.delete.map(j => j.id).sort(), ["d1", "o1"]);
  assert.equal(p.create.length + p.update.length, 0);
});

test("flyttet frist opdaterer fristen og den daglige startdag, mens serien ikke er begyndt", () => {
  const a = item("Ét"), moved = item("Ét", "2026-12-09T21:00:00.000Z");
  const existing = [remote(deadlineEvent(a, TZ), "d1"), remote(overdueEvent(a, TZ, NOW), "o1")];
  const p = plan([moved], existing);
  assert.equal(p.update.find(j => j.id === "d1").body.start.dateTime, "2026-12-09T21:00:00.000Z");
  assert.equal(p.update.find(j => j.id === "o1").body.start.dateTime, "2026-12-10T08:00:00");
});

test("en igangværende daglig serie flytter ikke startdag, når tiden går", () => {
  const a = item("Forsinket", "2026-11-20T22:55:00.000Z");
  const created = overdueEvent(a, TZ, new Date("2026-11-22T07:00:00.000Z").getTime()); // oprettet i sidste uge
  const p = plan([a], [remote(created, "o1")]);
  assert.deepEqual([p.create.length, p.update.length, p.unchanged], [0, 0, 1]);
});

test("en begivenhed, brugeren har slettet, oprettes ikke igen", () => {
  const a = item("Ét");
  const p = plan([a], [], { [`${assignmentKey(a)}:deadline`]: "x", [`${assignmentKey(a)}:overdue`]: "y" });
  assert.equal(p.create.length, 0);
  assert.equal(p.skipped, 2);
});

test("begivenheder uden vores markør røres aldrig, og dubletter slettes", () => {
  const a = item("Ét");
  const foreign = { id: "f", summary: "Tandlæge", start: { dateTime: "2026-12-01T10:00:00Z" } };
  const dup = remote(deadlineEvent(a, TZ), "d2");
  const p = plan([a], [foreign, remote(deadlineEvent(a, TZ), "d1"), dup, remote(overdueEvent(a, TZ, NOW), "o1")]);
  assert.deepEqual(p.delete.map(j => j.id), ["d2"]);
  assert.equal(p.create.length + p.update.length, 0);
});

test("de kendte begivenheder begrænses til 500, og fjernede glemmes", () => {
  let known = {};
  for (let i = 0; i < 520; i++) known = rememberRefs(known, { [`k${i}:deadline`]: `id${i}` });
  assert.equal(Object.keys(known).length, 500);
  assert.equal(rememberRefs({ a: "1", b: "2" }, { c: "3" }, ["a"]).a, undefined);
});

test("valgte påmindelser bruges, sorteres og begrænses til 5", () => {
  const event = deadlineEvent(item("Forsøg"), TZ, { minutes: [60, 4320, 60, 1440, 120, 30, 15] });
  assert.deepEqual(event.reminders.overrides.map(o => o.minutes), [4320, 1440, 120, 60, 30]);
  assert.deepEqual(deadlineEvent(item("Forsøg"), TZ, { minutes: [] }).reminders, { useDefault: false, overrides: [] });
});

test("ændrede påmindelser opdaterer den eksisterende begivenhed, også hvis Google ændrer rækkefølgen", () => {
  const a = item("Ét");
  const existing = remote(deadlineEvent(a, TZ), "d1");
  existing.start.dateTime = "2026-12-07T08:00:00+01:00"; // Google returnerer lokal tid med UTC-offset
  existing.reminders.overrides.reverse(); // Google returnerer dem i en anden rækkefølge: ingen ændring
  const same = planReminders({ open: [a], existing: [existing, remote(overdueEvent(a, TZ, NOW), "o1")], timeZone: TZ, now: NOW });
  assert.equal(same.update.length, 0);
  const changed = planReminders({ open: [a], existing: [existing, remote(overdueEvent(a, TZ, NOW), "o1")], timeZone: TZ, now: NOW, options: { minutes: [1440] } });
  assert.deepEqual(changed.update.map(u => u.id), ["d1"]);
  assert.deepEqual(changed.update[0].body.reminders.overrides, [{ method: "popup", minutes: 1440 }]);
});

test("slås den daglige påmindelse fra, oprettes den ikke, og en eksisterende slettes", () => {
  const a = item("Ét");
  const fresh = planReminders({ open: [a], existing: [], timeZone: TZ, now: NOW, options: { nag: false } });
  assert.deepEqual(fresh.create.map(j => j.ref.split(":")[1]), ["deadline"]);
  const existing = [remote(deadlineEvent(a, TZ), "d1"), remote(overdueEvent(a, TZ, NOW), "o1")];
  const off = planReminders({ open: [a], existing, timeZone: TZ, now: NOW, options: { nag: false } });
  assert.deepEqual(off.delete.map(j => j.id), ["o1"]);
});

test("antal dage og klokkeslæt for den daglige påmindelse følger indstillingerne", () => {
  const a = item("Ét");
  const event = overdueEvent(a, TZ, NOW, { nagDays: 30, nagHour: 7 });
  assert.deepEqual(event.recurrence, ["RRULE:FREQ=DAILY;COUNT=30"]);
  assert.equal(event.start.dateTime, "2026-12-07T07:00:00");
  // Allerede oprettet med standarden: antal dage og tid opdateres
  const existing = [remote(deadlineEvent(a, TZ), "d1"), remote(overdueEvent(a, TZ, NOW), "o1")];
  const p = planReminders({ open: [a], existing, timeZone: TZ, now: NOW, options: { nagDays: 30, nagHour: 7 } });
  assert.deepEqual(p.update.map(u => u.id), ["o1"]);
  assert.deepEqual(p.update[0].body.recurrence, ["RRULE:FREQ=DAILY;COUNT=30"]);
  assert.equal(p.update[0].body.start.dateTime, "2026-12-07T07:00:00");
});

test("et ændret klokkeslæt flytter ikke en serie, der allerede er begyndt, til en anden dag", () => {
  const a = item("Forsinket", "2026-11-20T22:55:00.000Z");
  const created = remote(overdueEvent(a, TZ, new Date("2026-11-22T07:00:00.000Z").getTime()), "o1"); // starter 23. nov. kl. 8
  created.start.dateTime = "2026-11-23T08:00:00+01:00"; // som Google returnerer den
  const p = plan([a], [created]);
  assert.equal(p.update.length, 0);
  const moved = planReminders({ open: [a], existing: [created], timeZone: TZ, now: NOW, options: { nagHour: 18 } });
  assert.equal(moved.update[0].body.start.dateTime, "2026-11-23T18:00:00");
});
