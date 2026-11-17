import test from "node:test";
import assert from "node:assert/strict";
import { autoSyncText, formatOffset, resolveSettings, timeZoneLabel, timeZoneOptions } from "../src/settings.js";

const defaults = { maxWeeks: 12, defaultWeeks: 4, autoSyncMinutes: 30, calendarName: "Studie+ skema", timeZone: "Europe/Copenhagen" };

test("uden gemte valg bruges config.js", () => {
  assert.deepEqual(resolveSettings({}, defaults), { scheduleWeeks: 4, autoSync: true, autoSyncMinutes: 30, timeZone: "Europe/Copenhagen", theme: "auto", calendarName: "Studie+ skema" });
});

test("gemte valg vinder, og uger begrænses af maxWeeks", () => {
  const s = resolveSettings({ scheduleWeeks: 99, autoSync: false, autoSyncMinutes: 60, calendarName: "  Skole  " }, defaults);
  assert.deepEqual(s, { scheduleWeeks: 12, autoSync: false, autoSyncMinutes: 60, timeZone: "Europe/Copenhagen", theme: "auto", calendarName: "Skole" });
});

test("ugyldige værdier falder tilbage til config.js", () => {
  const s = resolveSettings({ scheduleWeeks: "abc", autoSyncMinutes: 0, calendarName: "   " }, defaults);
  assert.equal(s.scheduleWeeks, 4);
  assert.equal(s.autoSyncMinutes, 30);
  assert.equal(s.calendarName, "Studie+ skema");
  assert.equal(s.timeZone, "Europe/Copenhagen");
});

test("brugerens tidszone gemmes, og ugyldige tidszoner afvises", () => {
  assert.equal(resolveSettings({ timeZone: "America/New_York" }, defaults).timeZone, "America/New_York");
  assert.equal(resolveSettings({ timeZone: "Not/A_Timezone" }, defaults).timeZone, "Europe/Copenhagen");
});

test("teksten om automatisk synkronisering følger indstillingerne", () => {
  assert.match(autoSyncText({ autoSync: true, autoSyncMinutes: 30 }), /hvert 30\. minut/);
  assert.match(autoSyncText({ autoSync: true, autoSyncMinutes: 60 }), /hver time/);
  assert.match(autoSyncText({ autoSync: false, autoSyncMinutes: 30 }), /slået fra/);
});

test("tidszone-tekst viser GMT-forskydning, også med sommertid", () => {
  const winter = new Date("2026-01-15T12:00:00Z");
  const summer = new Date("2026-07-15T12:00:00Z");
  assert.equal(timeZoneLabel("Europe/Copenhagen", winter), "(GMT+1) Europe/Copenhagen");
  assert.equal(timeZoneLabel("Europe/Copenhagen", summer), "(GMT+2) Europe/Copenhagen");
  assert.equal(timeZoneLabel("Asia/Kolkata", winter), "(GMT+5:30) Asia/Kolkata");
  assert.equal(timeZoneLabel("America/New_York", winter), "(GMT-5) America/New York");
  assert.equal(timeZoneLabel("UTC", winter), "(GMT) UTC");
  assert.equal(formatOffset(-570), "GMT-9:30");
});

test("tidszoner sorteres efter forskydning og derefter navn", () => {
  const list = timeZoneOptions(["Europe/Copenhagen", "Asia/Tokyo", "UTC", "America/New_York", "Europe/Berlin"], new Date("2026-01-15T12:00:00Z"));
  assert.deepEqual(list.map(([id]) => id), ["America/New_York", "UTC", "Europe/Berlin", "Europe/Copenhagen", "Asia/Tokyo"]);
});

test("udseende: auto er standard, ugyldigt falder tilbage", () => {
  assert.equal(resolveSettings({}, defaults).theme, "auto");
  assert.equal(resolveSettings({ theme: "dark" }, defaults).theme, "dark");
  assert.equal(resolveSettings({ theme: "light" }, defaults).theme, "light");
  assert.equal(resolveSettings({ theme: "neon" }, defaults).theme, "auto");
});
