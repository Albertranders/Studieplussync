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
