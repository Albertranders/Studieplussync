import test from "node:test";
import assert from "node:assert/strict";
import { autoSyncText, resolveSettings } from "../settings.js";

const defaults = { maxWeeks: 12, defaultWeeks: 4, autoSyncMinutes: 30, calendarName: "Studie+ skema" };

test("uden gemte valg bruges config.js", () => {
  assert.deepEqual(resolveSettings({}, defaults), { scheduleWeeks: 4, autoSync: true, autoSyncMinutes: 30, calendarName: "Studie+ skema" });
});

test("gemte valg vinder, og uger begrænses af maxWeeks", () => {
  const s = resolveSettings({ scheduleWeeks: 99, autoSync: false, autoSyncMinutes: 60, calendarName: "  Skole  " }, defaults);
  assert.deepEqual(s, { scheduleWeeks: 12, autoSync: false, autoSyncMinutes: 60, calendarName: "Skole" });
});

test("ugyldige værdier falder tilbage til config.js", () => {
  const s = resolveSettings({ scheduleWeeks: "abc", autoSyncMinutes: 0, calendarName: "   " }, defaults);
  assert.equal(s.scheduleWeeks, 4);
  assert.equal(s.autoSyncMinutes, 30);
  assert.equal(s.calendarName, "Studie+ skema");
});

test("teksten om automatisk synkronisering følger indstillingerne", () => {
  assert.match(autoSyncText({ autoSync: true, autoSyncMinutes: 30 }), /hvert 30\. minut/);
  assert.match(autoSyncText({ autoSync: true, autoSyncMinutes: 60 }), /hver time/);
  assert.match(autoSyncText({ autoSync: false, autoSyncMinutes: 30 }), /slået fra/);
});
