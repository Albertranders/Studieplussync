// Tests af synkroniseringslogikken i sync.js. Kør med: npm test  (eller: node --test)
import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, contentHash, eventBody, isSafeSchedule, isSuspiciousDrop, MANAGED_HASH, MANAGED_KEY } from "../sync.js";

// Eksempel-lektion, som testene bruger
const lesson = {
  id: "l-1", date: "2026-11-10", start: "08:00", end: "09:30",
  subject: "Matematik", room: "A12", teacher: "MH", homework: "Side 42", note: ""
};
// Efterligner et Google-event, som vi tidligere har oprettet for en lektion
function eventFor(item, id = "g-1") {
  return {
    id,
    extendedProperties: { private: {
      [MANAGED_KEY]: item.id,
      [MANAGED_HASH]: contentHash(item)
    } }
  };
}

// Ny lektion, som ikke findes i kalenderen -> skal oprettes
test("creates an event for a new lesson", () => {
  const plan = buildPlan([lesson], []);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.delete.length, 0);
});

// Identisk lektion i kalenderen -> skal ikke røres
test("leaves an unchanged managed event alone", () => {
  const plan = buildPlan([lesson], [eventFor(lesson)]);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.create.length, 0);
});

// Skiftet lokale -> eventet skal opdateres (samme Google-id)
test("updates an event when lesson details change", () => {
  const old = eventFor(lesson);
  const changed = { ...lesson, room: "B7" };
  const plan = buildPlan([changed], [old]);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].id, "g-1");
});

// Kun vores egne events slettes; personlige events (uden vores nøgle) bliver liggende
test("deletes only managed events no longer in the schedule", () => {
  const plan = buildPlan([], [eventFor(lesson), { id: "personal-event" }]);
  assert.deepEqual(plan.delete, ["g-1"]);
});

// To lektioner med samme nøgle giver kun ét event
test("deduplicates duplicate lesson keys", () => {
  const plan = buildPlan([lesson, { ...lesson, room: "A13" }], []);
  assert.equal(plan.create.length, 1);
});

// Lektier giver blå farve (9), og lærer og lektier står i beskrivelsen
test("colours lessons with homework and includes teacher and homework", () => {
  const body = eventBody(lesson);
  assert.equal(body.colorId, "9");
  assert.match(body.description, /Lærer: MH/);
  assert.match(body.description, /Side 42/);
});

// Tomme eller ufuldstændige skemaer afvises
test("rejects empty or malformed scraped schedules", () => {
  assert.equal(isSafeSchedule([]), false);
  assert.equal(isSafeSchedule([{ subject: "X" }]), false);
  assert.equal(isSafeSchedule([lesson]), true);
});

// Et pludseligt fald til under halvdelen af lektionerne (ved mindst 4) regnes som mistænkeligt
test("protects against partial schedule extraction", () => {
  assert.equal(isSuspiciousDrop(12, 3), true);
  assert.equal(isSuspiciousDrop(12, 6), false);
  assert.equal(isSuspiciousDrop(3, 1), false);
});

test("lektion med meget lang lektie er uændret, når Google har afkortet egenskaber til 1024 tegn", () => {
  const lesson = { id: "7", date: "2026-11-10", start: "08:15", end: "09:45", subject: "Dansk", homework: "x".repeat(3000) };
  const hash = contentHash(lesson);
  assert.ok(hash.length < 60);
  // Simulerer Googles afkortning af værdier over 1024 tegn
  const stored = hash.slice(0, 1024);
  const existing = [{ id: "g1", extendedProperties: { private: { [MANAGED_KEY]: "7", [MANAGED_HASH]: stored } } }];
  const plan = buildPlan([lesson], existing);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.update.length, 0);
});

test("hash ændrer sig, når indholdet ændrer sig", () => {
  const a = { id: "1", date: "2026-11-10", start: "08:15", end: "09:45", subject: "Dansk", homework: "s. 42" };
  assert.notEqual(contentHash(a), contentHash({ ...a, homework: "s. 43" }));
  assert.equal(contentHash(a), contentHash({ ...a }));
});

test("gamle events med hele teksten som hash opdateres ikke unødigt", () => {
  const lesson = { id: "2", date: "2026-11-10", start: "10:00", end: "11:30", subject: "Matematik", room: "A1" };
  const legacy = JSON.stringify(eventBody(lesson));
  const existing = [{ id: "g2", extendedProperties: { private: { [MANAGED_KEY]: "2", [MANAGED_HASH]: legacy } } }];
  assert.equal(buildPlan([lesson], existing).unchanged, 1);
});
