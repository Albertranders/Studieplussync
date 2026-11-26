import test from "node:test";
import assert from "node:assert/strict";
import { assignmentKey, dueDate, formatDeadline, keyFromNotes, planTasks, rememberKeys, taskBody } from "../src/tasks.js";

const TZ = "Europe/Copenhagen";
const a = (title, extra = {}) => ({ subject: "Fysik", title, due: "2026-12-06T21:00:00.000Z", start: "2026-11-24T07:00:00.000Z", ...extra });
// En opgave, som den ser ud i Google Tasks efter oprettelse.
const remote = (item, extra = {}) => ({ id: `t-${assignmentKey(item)}`, status: "needsAction", ...taskBody(item, TZ), ...extra });

test("nøglen er stabil, uafhængig af fristen og forskellig for forskellige afleveringer", () => {
  assert.equal(assignmentKey(a("Forsøg")), assignmentKey(a("Forsøg")));
  assert.equal(assignmentKey(a("Forsøg")), assignmentKey(a("Forsøg", { due: "2027-01-01T10:00:00.000Z" })));
  assert.notEqual(assignmentKey(a("Forsøg")), assignmentKey(a("Andet")));
  assert.notEqual(assignmentKey(a("Forsøg")), assignmentKey(a("Forsøg", { start: "2026-11-30T07:00:00.000Z" })));
  assert.match(assignmentKey(a("Forsøg")), /^[a-z0-9]+$/);
});

test("fristens dato følger tidszonen, ikke UTC", () => {
  assert.equal(dueDate("2026-12-06T21:00:00.000Z", TZ), "2026-12-06"); // 22.00 lokal tid
  assert.equal(dueDate("2026-12-06T23:30:00.000Z", TZ), "2026-12-07"); // 00.30 lokal tid, næste dag
  assert.equal(dueDate("2026-12-06T23:30:00.000Z", "UTC"), "2026-12-06");
});

test("opgaven får fag og titel, frist i noterne og en markør", () => {
  const body = taskBody(a("Forsøg om kapacitorer"), TZ);
  assert.equal(body.title, "Fysik: Forsøg om kapacitorer");
  assert.equal(body.due, "2026-12-06T00:00:00.000Z");
  assert.match(body.notes, /Frist: søndag 6\. december 2026 kl\. 22\.00/);
  assert.equal(keyFromNotes(body.notes), assignmentKey(a("Forsøg om kapacitorer")));
  assert.equal(formatDeadline("2026-12-02T22:55:00.000Z", TZ), "onsdag 2. december 2026 kl. 23.55");
  assert.equal(taskBody({ title: "Uden fag", due: "2026-12-06T21:00:00.000Z" }, TZ).title, "Uden fag");
});

test("markøren findes kun i vores egne opgaver", () => {
  assert.equal(keyFromNotes("Køb mælk"), null);
  assert.equal(keyFromNotes(undefined), null);
  assert.equal(keyFromNotes("tekst\n[StudieSync:abc12]"), "abc12");
});

test("nye afleveringer oprettes, uændrede røres ikke", () => {
  const one = a("Ét"), two = a("To");
  const plan = planTasks({ open: [one, two], existing: [remote(one)], known: { [assignmentKey(one)]: "x" }, timeZone: TZ });
  assert.deepEqual(plan.create.map(job => job.key), [assignmentKey(two)]);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual([plan.update.length, plan.complete.length, plan.skipped], [0, 0, 0]);
});

test("flyttet frist eller ny titel opdaterer den eksisterende opgave", () => {
  const item = a("Ét");
  const moved = { ...item, due: "2026-12-09T21:00:00.000Z" };
  const plan = planTasks({ open: [moved], existing: [remote(item)], timeZone: TZ });
  assert.equal(plan.create.length, 0);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].body.due, "2026-12-09T00:00:00.000Z");
});

test("en aflevering, der ikke længere er åben, afsluttes og slettes ikke", () => {
  const gone = a("Afleveret");
  const plan = planTasks({ open: [], existing: [remote(gone)], timeZone: TZ });
  assert.deepEqual(plan.complete.map(job => job.id), [remote(gone).id]);
  assert.equal(plan.create.length + plan.update.length, 0);
});

test("en opgave, brugeren selv har afsluttet, genåbnes aldrig", () => {
  const item = a("Ét");
  const plan = planTasks({ open: [item], existing: [remote(item, { status: "completed" })], timeZone: TZ });
  assert.deepEqual([plan.create.length, plan.update.length, plan.complete.length, plan.unchanged], [0, 0, 0, 1]);
});

test("en opgave, brugeren har slettet, oprettes ikke igen", () => {
  const item = a("Ét");
  const plan = planTasks({ open: [item], existing: [], known: { [assignmentKey(item)]: "t-1" }, timeZone: TZ });
  assert.equal(plan.create.length, 0);
  assert.equal(plan.skipped, 1);
});

test("opgaver uden vores markør røres aldrig", () => {
  const mine = { id: "m", status: "needsAction", title: "Køb mælk", notes: "Husk det", due: "2026-12-01T00:00:00.000Z" };
  const plan = planTasks({ open: [], existing: [mine], timeZone: TZ });
  assert.deepEqual([plan.create.length, plan.update.length, plan.complete.length], [0, 0, 0]);
});

test("dubletter i listen afsluttes, og to ens afleveringer giver én opgave", () => {
  const item = a("Ét");
  const first = remote(item), second = { ...remote(item), id: "dublet" };
  const plan = planTasks({ open: [item, { ...item }], existing: [first, second], timeZone: TZ });
  assert.deepEqual(plan.complete.map(job => job.id), ["dublet"]);
  assert.equal(plan.create.length, 0);
});

test("de kendte nøgler begrænses til 500, og de ældste glemmes først", () => {
  let known = {};
  for (let i = 0; i < 520; i++) known = rememberKeys(known, { [`k${i}`]: `id${i}` });
  const keys = Object.keys(known);
  assert.equal(keys.length, 500);
  assert.equal(keys[0], "k20");
  assert.equal(known.k519, "id519");
});

test("ændrede linjeskift i noterne giver ikke en unødig opdatering", () => {
  const item = a("Ét");
  const mangled = remote(item, { notes: remote(item).notes.replaceAll("\n", "\r\n") + "\n" });
  assert.equal(planTasks({ open: [item], existing: [mangled], timeZone: TZ }).update.length, 0);
});
