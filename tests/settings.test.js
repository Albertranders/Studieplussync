import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReminderMinutes, reminderLabel, autoSyncText, formatOffset, resolveSettings, timeZoneLabel, timeZoneOptions } from "../src/settings.js";

const defaults = { maxWeeks: 12, defaultWeeks: 4, autoSyncMinutes: 30, calendarName: "Studie+ skema", timeZone: "Europe/Copenhagen" };

// Cover settings defaults, validation, time-zone labels, ordering, and theme selection.
test("configuration defaults are used when no saved settings exist", () => {
  assert.deepEqual(resolveSettings({}, defaults), { scheduleWeeks: 4, autoSync: true, tasksSync: false, assignmentReminders: false, hideReminderCalendar: true, assignmentReminderMinutes: [4320, 1440, 120], assignmentNag: true, assignmentNagDays: 14, assignmentNagHour: 8, autoSyncMinutes: 30, timeZone: "Europe/Copenhagen", theme: "auto", calendarName: "Studie+ skema" });
});

test("saved choices override defaults and week counts respect maxWeeks", () => {
  const s = resolveSettings({ scheduleWeeks: 99, autoSync: false, autoSyncMinutes: 60, calendarName: "  Skole  " }, defaults);
  assert.deepEqual(s, { scheduleWeeks: 12, autoSync: false, tasksSync: false, assignmentReminders: false, hideReminderCalendar: true, assignmentReminderMinutes: [4320, 1440, 120], assignmentNag: true, assignmentNagDays: 14, assignmentNagHour: 8, autoSyncMinutes: 60, timeZone: "Europe/Copenhagen", theme: "auto", calendarName: "Skole" });
});

test("invalid saved values fall back to configuration defaults", () => {
  const s = resolveSettings({ scheduleWeeks: "abc", autoSyncMinutes: 0, calendarName: "   " }, defaults);
  assert.equal(s.scheduleWeeks, 4);
  assert.equal(s.autoSyncMinutes, 30);
  assert.equal(s.calendarName, "Studie+ skema");
  assert.equal(s.timeZone, "Europe/Copenhagen");
});

test("valid user time zones are retained and invalid zones are rejected", () => {
  assert.equal(resolveSettings({ timeZone: "America/New_York" }, defaults).timeZone, "America/New_York");
  assert.equal(resolveSettings({ timeZone: "Not/A_Timezone" }, defaults).timeZone, "Europe/Copenhagen");
});

test("automatic-sync copy reflects the configured interval", () => {
  assert.match(autoSyncText({ autoSync: true, autoSyncMinutes: 30 }), /hvert 30\. minut/);
  assert.match(autoSyncText({ autoSync: true, autoSyncMinutes: 60 }), /hver time/);
  assert.match(autoSyncText({ autoSync: false, autoSyncMinutes: 30 }), /slået fra/);
});

test("time-zone labels show GMT offsets, including daylight-saving changes", () => {
  const winter = new Date("2026-01-15T12:00:00Z");
  const summer = new Date("2026-07-15T12:00:00Z");
  assert.equal(timeZoneLabel("Europe/Copenhagen", winter), "(GMT+1) Europe/Copenhagen");
  assert.equal(timeZoneLabel("Europe/Copenhagen", summer), "(GMT+2) Europe/Copenhagen");
  assert.equal(timeZoneLabel("Asia/Kolkata", winter), "(GMT+5:30) Asia/Kolkata");
  assert.equal(timeZoneLabel("America/New_York", winter), "(GMT-5) America/New York");
  assert.equal(timeZoneLabel("UTC", winter), "(GMT) UTC");
  assert.equal(formatOffset(-570), "GMT-9:30");
});

test("time zones are sorted by offset and then by name", () => {
  const list = timeZoneOptions(["Europe/Copenhagen", "Asia/Tokyo", "UTC", "America/New_York", "Europe/Berlin"], new Date("2026-01-15T12:00:00Z"));
  assert.deepEqual(list.map(([id]) => id), ["America/New_York", "UTC", "Europe/Berlin", "Europe/Copenhagen", "Asia/Tokyo"]);
});

test("automatic theme is the default and invalid themes fall back to it", () => {
  assert.equal(resolveSettings({}, defaults).theme, "auto");
  assert.equal(resolveSettings({ theme: "dark" }, defaults).theme, "dark");
  assert.equal(resolveSettings({ theme: "light" }, defaults).theme, "light");
  assert.equal(resolveSettings({ theme: "neon" }, defaults).theme, "auto");
});

test("Google Tasks er slået fra som standard og slås kun til af true", () => {
  assert.equal(resolveSettings({}, defaults).tasksSync, false);
  assert.equal(resolveSettings({ tasksSync: true }, defaults).tasksSync, true);
  assert.equal(resolveSettings({ tasksSync: "true" }, defaults).tasksSync, false);
});

test("afleveringspåmindelser er slået fra og kalenderen skjult som standard", () => {
  const base = resolveSettings({}, defaults);
  assert.equal(base.assignmentReminders, false);
  assert.equal(base.hideReminderCalendar, true);
  assert.equal(resolveSettings({ assignmentReminders: true, hideReminderCalendar: false }, defaults).hideReminderCalendar, false);
  assert.equal(resolveSettings({ assignmentReminders: "ja" }, defaults).assignmentReminders, false);
});

test("påmindelser gøres gyldige: unikke, længst tid først, højst 5 og kun 0 til 4 uger", () => {
  assert.deepEqual(normalizeReminderMinutes([120, 4320, 1440, 120]), [4320, 1440, 120]);
  assert.deepEqual(normalizeReminderMinutes([15, 30, 60, 120, 360, 720, 1440]), [1440, 720, 360, 120, 60]);
  assert.deepEqual(normalizeReminderMinutes([-5, 99999, "x", 1.5, 60]), [60]);
  assert.deepEqual(normalizeReminderMinutes([]), []);                       // "ingen påmindelser" er et gyldigt valg
  assert.deepEqual(normalizeReminderMinutes(undefined), [4320, 1440, 120]); // ikke gemt: standarden
  assert.deepEqual(normalizeReminderMinutes("4320"), [4320, 1440, 120]);
});

test("etiketter til påmindelser", () => {
  assert.deepEqual([15, 60, 120, 1440, 2880, 4320, 10080, 20160, 0].map(reminderLabel),
    ["15 min.", "1 time", "2 timer", "24 timer", "2 dage", "3 dage", "1 uge", "2 uger", "Ved start"]);
});

test("indstillinger for den daglige påmindelse har grænser og standarder", () => {
  const s = resolveSettings({ assignmentNag: false, assignmentNagDays: 500, assignmentNagHour: 30, assignmentReminderMinutes: [60] }, defaults);
  assert.deepEqual([s.assignmentNag, s.assignmentNagDays, s.assignmentNagHour, s.assignmentReminderMinutes], [false, 60, 23, [60]]);
  const d = resolveSettings({ assignmentNagDays: 0, assignmentNagHour: "", }, defaults);
  assert.deepEqual([d.assignmentNagDays, d.assignmentNagHour], [1, 8]);
});
