import test from "node:test";
import assert from "node:assert/strict";
import { assignmentState, buildAssignmentsCache, openCount, resolveTab, sortedAssignments } from "../src/assignments.js";

// Fast "nu": 25. november 2026 kl. 10.00 lokal tid.
const now = new Date(2026, 10, 25, 10, 0);
const at = (day, hour = 12) => new Date(2026, 10, day, hour, 0).toISOString();
const item = (id, day, extra = {}) => ({ id, subject: "Dansk", title: `Opgave ${id}`, due: at(day), ...extra });

test("cachen beholder gyldige afleveringer og fjerner ugyldige og dubletter", () => {
  const cache = buildAssignmentsCache([
    item(1, 28), item(1, 29), { id: 2, title: "Uden frist" }, { title: "Uden id", due: at(28) },
    { id: 3, due: at(28) }, null, item(4, 30, { submitted: true })
  ], now);
  assert.deepEqual(cache.assignments.map(a => a.id), ["1", "4"]);
  assert.equal(cache.assignments[1].submitted, true);
  assert.equal(cache.at, now.toISOString());
});

test("cachen er tom, når input ikke er en liste", () => {
  assert.deepEqual(buildAssignmentsCache(undefined, now).assignments, []);
});

test("tilstand: forfaldet, i dag, kommende og afleveret", () => {
  assert.equal(assignmentState(item(1, 24), now), "overdue");
  assert.equal(assignmentState({ ...item(1, 25), due: at(25, 9) }, now), "overdue");
  assert.equal(assignmentState(item(1, 25, { due: at(25, 14) }), now), "today");
  assert.equal(assignmentState(item(1, 26), now), "upcoming");
  assert.equal(assignmentState(item(1, 20, { submitted: true }), now), "done");
});

test("åbne afleveringer sorteres efter frist, afleverede kommer sidst", () => {
  const cache = buildAssignmentsCache([
    item("a", 30), item("b", 24), item("c", 27, { submitted: true }), item("d", 26), item("e", 20, { submitted: true })
  ], now);
  assert.deepEqual(sortedAssignments(cache, now).map(a => a.id), ["b", "d", "a", "c", "e"]);
});

test("manglende cache giver null, så fanen kan forklare det", () => {
  assert.equal(sortedAssignments(undefined, now), null);
  assert.equal(sortedAssignments({}, now), null);
  assert.deepEqual(sortedAssignments({ assignments: [] }, now), []);
});

test("openCount tæller kun uafleverede", () => {
  const cache = buildAssignmentsCache([item(1, 26), item(2, 27, { submitted: true }), item(3, 24)], now);
  assert.equal(openCount(cache), 2);
  assert.equal(openCount(undefined), 0);
});

test("ukendt fane falder tilbage til skema", () => {
  assert.equal(resolveTab("assignments"), "assignments");
  assert.equal(resolveTab("schedule"), "schedule");
  assert.equal(resolveTab("noget andet"), "schedule");
  assert.equal(resolveTab(undefined), "schedule");
});

test("uafleverede opgaver med en frist over 30 dage gammel droppes, men afleverede beholdes", () => {
  const cache = buildAssignmentsCache([
    item("gammel", 1, { due: new Date(2026, 9, 1, 12).toISOString() }),
    item("nylig", 1, { due: new Date(2026, 10, 10, 12).toISOString() }),
    item("afleveret", 1, { due: new Date(2026, 9, 1, 12).toISOString(), submitted: true })
  ], now);
  assert.deepEqual(cache.assignments.map(a => a.id), ["nylig", "afleveret"]);
});
