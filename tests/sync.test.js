import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, contentHash, eventBody, isSafeSchedule, isSuspiciousDrop, MANAGED_HASH, MANAGED_KEY } from "../sync.js";

const lesson = {
  id: "l-1", date: "2026-11-10", start: "08:00", end: "09:30",
  subject: "Matematik", room: "A12", teacher: "MH", homework: "Side 42", note: ""
};
function eventFor(item, id = "g-1") {
  return {
    id,
    extendedProperties: { private: {
      [MANAGED_KEY]: item.id,
      [MANAGED_HASH]: contentHash(item)
    } }
  };
}

test("creates an event for a new lesson", () => {
  const plan = buildPlan([lesson], []);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.delete.length, 0);
});

test("leaves an unchanged managed event alone", () => {
  const plan = buildPlan([lesson], [eventFor(lesson)]);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.create.length, 0);
});

test("updates an event when lesson details change", () => {
  const old = eventFor(lesson);
  const changed = { ...lesson, room: "B7" };
  const plan = buildPlan([changed], [old]);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].id, "g-1");
});

test("deletes only managed events no longer in the schedule", () => {
  const plan = buildPlan([], [eventFor(lesson), { id: "personal-event" }]);
  assert.deepEqual(plan.delete, ["g-1"]);
});

test("deduplicates duplicate lesson keys", () => {
  const plan = buildPlan([lesson, { ...lesson, room: "A13" }], []);
  assert.equal(plan.create.length, 1);
});

test("colours lessons with homework and includes teacher and homework", () => {
  const body = eventBody(lesson);
  assert.equal(body.colorId, "9");
  assert.match(body.description, /Lærer: MH/);
  assert.match(body.description, /Side 42/);
});

test("rejects empty or malformed scraped schedules", () => {
  assert.equal(isSafeSchedule([]), false);
  assert.equal(isSafeSchedule([{ subject: "X" }]), false);
  assert.equal(isSafeSchedule([lesson]), true);
});

test("protects against partial schedule extraction", () => {
  assert.equal(isSuspiciousDrop(12, 3), true);
  assert.equal(isSuspiciousDrop(12, 6), false);
  assert.equal(isSuspiciousDrop(3, 1), false);
});
