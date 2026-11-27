// Test calendar planning and event-content helpers without browser or network dependencies.
import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, contentHash, eventBody, isSafeSchedule, isSuspiciousDrop, MANAGED_HASH, MANAGED_KEY } from "../src/sync.js";

// Shared lesson fixture used by calendar-planning tests.
const lesson = {
  id: "l-1", date: "2026-11-10", start: "08:00", end: "09:30",
  subject: "Matematik", room: "A12", teacher: "MH", homework: "Side 42", note: ""
};
// Build a Google event fixture that this extension previously managed.
function eventFor(item, id = "g-1") {
  return {
    id,
    extendedProperties: { private: {
      [MANAGED_KEY]: item.id,
      [MANAGED_HASH]: contentHash(item)
    } }
  };
}

// A lesson missing from the calendar should be created.
test("creates an event for a new lesson", () => {
  const plan = buildPlan([lesson], []);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.delete.length, 0);
});

// An unchanged managed lesson should not trigger a write.
test("leaves an unchanged managed event alone", () => {
  const plan = buildPlan([lesson], [eventFor(lesson)]);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.create.length, 0);
});

// A changed room should update the existing event while preserving its Google ID.
test("updates an event when lesson details change", () => {
  const old = eventFor(lesson);
  const changed = { ...lesson, room: "B7" };
  const plan = buildPlan([changed], [old]);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].id, "g-1");
});

// Remove only managed events; personal events without our key must remain untouched.
test("deletes only managed events no longer in the schedule", () => {
  const plan = buildPlan([], [eventFor(lesson), { id: "personal-event" }]);
  assert.deepEqual(plan.delete, ["g-1"]);
});

// Duplicate lesson keys should produce only one event.
test("deduplicates duplicate lesson keys", () => {
  const plan = buildPlan([lesson, { ...lesson, room: "A13" }], []);
  assert.equal(plan.create.length, 1);
});

// Homework controls the event color and appears with the teacher in its description.
test("colours lessons with homework and includes teacher and homework", () => {
  const body = eventBody(lesson);
  assert.equal(body.colorId, "9");
  assert.match(body.description, /Lærer: MH/);
  assert.match(body.description, /Side 42/);
});

// Empty or incomplete schedules must fail validation.
test("rejects empty or malformed scraped schedules", () => {
  assert.equal(isSafeSchedule([]), false);
  assert.equal(isSafeSchedule([{ subject: "X" }]), false);
  assert.equal(isSafeSchedule([lesson]), true);
});

// A sudden drop below half the existing lesson count is treated as suspicious.
test("protects against partial schedule extraction", () => {
  assert.equal(isSuspiciousDrop(12, 3), true);
  assert.equal(isSuspiciousDrop(12, 6), false);
  assert.equal(isSuspiciousDrop(3, 1), false);
});

test("long homework remains unchanged when Google truncates properties to 1024 characters", () => {
  const lesson = { id: "7", date: "2026-11-10", start: "08:15", end: "09:45", subject: "Dansk", homework: "x".repeat(3000) };
  const hash = contentHash(lesson);
  assert.ok(hash.length < 60);
  // Simulate Google's truncation of private-property values longer than 1024 characters.
  const stored = hash.slice(0, 1024);
  const existing = [{ id: "g1", extendedProperties: { private: { [MANAGED_KEY]: "7", [MANAGED_HASH]: stored } } }];
  const plan = buildPlan([lesson], existing);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.update.length, 0);
});

test("the content hash changes when lesson content changes", () => {
  const a = { id: "1", date: "2026-11-10", start: "08:15", end: "09:45", subject: "Dansk", homework: "s. 42" };
  assert.notEqual(contentHash(a), contentHash({ ...a, homework: "s. 43" }));
  assert.equal(contentHash(a), contentHash({ ...a }));
});

test("legacy events storing full content as the hash are not needlessly updated", () => {
  const lesson = { id: "2", date: "2026-11-10", start: "10:00", end: "11:30", subject: "Matematik", room: "A1" };
  const legacy = JSON.stringify(eventBody(lesson));
  const existing = [{ id: "g2", extendedProperties: { private: { [MANAGED_KEY]: "2", [MANAGED_HASH]: legacy } } }];
  assert.equal(buildPlan([lesson], existing).unchanged, 1);
});

// --- Notifikationer for lektioner ---
import { lessonOverrides, eventBody as bodyOf, contentHash as hashOf, MANAGED_REMINDER as REM } from "../src/sync.js";
const L = (id, date, start, extra = {}) => ({ id, date, start, end: "23:00", subject: "Mat", ...extra });
const TZ = "Europe/Copenhagen";

test("lesson reminders: scope 'first' gives only the earliest lesson per day, 'all' gives every lesson", () => {
  const lessons = [L("a", "2026-12-01", "10:00"), L("b", "2026-12-01", "08:00"), L("c", "2026-12-02", "09:00"), L("d", "2026-12-02", "09:00")];
  const first = lessonOverrides(lessons, { minutes: [15, 5], scope: "first" });
  assert.deepEqual([...first], [["a", []], ["b", [15, 5]], ["c", [15, 5]], ["d", [15, 5]]]);
  const all = lessonOverrides(lessons, { minutes: [15], scope: "all" });
  assert.ok([...all.values()].every(v => v.length === 1));
  assert.equal(lessonOverrides(lessons, null).size, 0);
});

test("lesson reminders: the event body and fingerprint are unchanged when reminders are off", () => {
  const lesson = L("a", "2026-12-01", "08:00");
  assert.equal("reminders" in bodyOf(lesson, TZ), false);
  assert.equal(hashOf(lesson, TZ), hashOf(lesson, TZ, null));
  assert.notEqual(hashOf(lesson, TZ, [15]), hashOf(lesson, TZ));
  assert.deepEqual(bodyOf(lesson, TZ, [15]).reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 15 }] });
  assert.deepEqual(bodyOf(lesson, TZ, []).reminders, { useDefault: false, overrides: [] });
});

test("lesson reminders: turning reminders on updates events, off resets only events we set", () => {
  const lessons = [L("a", "2026-12-01", "08:00"), L("b", "2026-12-01", "10:00")];
  const plain = lessons.map(l => ({ id: "E" + l.id, extendedProperties: { private: { studiesyncKey: l.id, studiesyncHash: hashOf(l, TZ) } } }));
  const on = buildPlan(lessons, plain, TZ, { minutes: [15], scope: "first" });
  assert.equal(on.update.length, 2);
  assert.deepEqual(on.update.map(u => u.overrides), [[15], []]);
  assert.ok(on.update.every(u => u.reset === false));
  // Stabilt, når alt er anvendt
  const applied = on.update.map(u => ({ id: u.id, extendedProperties: { private: { studiesyncKey: u.key, studiesyncHash: hashOf(u.lesson, TZ, u.overrides), [REM]: "1" } } }));
  assert.equal(buildPlan(lessons, applied, TZ, { minutes: [15], scope: "first" }).unchanged, 2);
  // Slået fra igen: begge nulstilles
  const off = buildPlan(lessons, applied, TZ, null);
  assert.equal(off.update.length, 2);
  assert.ok(off.update.every(u => u.overrides === null && u.reset === true));
  // En begivenhed uden vores markør nulstilles ikke
  const foreign = [{ ...applied[0], extendedProperties: { private: { ...applied[0].extendedProperties.private, [REM]: "0" } } }];
  assert.equal(buildPlan([lessons[0]], foreign, TZ, null).update[0].reset, false);
});
