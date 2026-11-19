import test from "node:test";
import assert from "node:assert/strict";
import { buildLessonsCache, todayLessons, wallTimeToDate } from "../src/lessons-cache.js";

const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

test("wall time is converted using the zone's offset, including daylight saving", () => {
  assert.equal(wallTimeToDate("2026-01-15", "08:00", "Europe/Copenhagen").toISOString(), "2026-01-15T07:00:00.000Z");
  assert.equal(wallTimeToDate("2026-07-15", "08:00", "Europe/Copenhagen").toISOString(), "2026-07-15T06:00:00.000Z");
  assert.equal(wallTimeToDate("2026-01-15", "08:00", "UTC").toISOString(), "2026-01-15T08:00:00.000Z");
});

test("the cache keeps only complete lessons and trims long text", () => {
  const cache = buildLessonsCache([
    { date: "2026-11-19", start: "08:00", end: "09:30", subject: "Matematik", room: "A12", homework: "hemmelig" },
    { date: "2026-11-19", start: "10:00", subject: "Mangler slut" },
    null
  ], "Europe/Copenhagen", new Date("2026-11-19T06:00:00Z"));
  assert.deepEqual(cache, {
    at: "2026-11-19T06:00:00.000Z", timeZone: "Europe/Copenhagen",
    lessons: [{ date: "2026-11-19", start: "08:00", end: "09:30", subject: "Matematik", room: "A12" }]
  });
});

test("todayLessons returns only today's lessons, sorted by start time", () => {
  const now = new Date(2026, 10, 19, 12, 0); // lokal tid
  const cache = buildLessonsCache([
    { date: "2026-11-19", start: "13:00", end: "14:00", subject: "Dansk", room: "B1" },
    { date: "2026-11-19", start: "08:00", end: "09:30", subject: "Matematik", room: "A12" },
    { date: "2026-11-18", start: "08:00", end: "09:30", subject: "I går" },
    { date: "2026-11-20", start: "08:00", end: "09:30", subject: "I morgen" }
  ], LOCAL_ZONE, now);
  const today = todayLessons(cache, now);
  assert.deepEqual(today.map(l => l.summary), ["Matematik", "Dansk"]);
  assert.equal(today[0].location, "A12");
  assert.equal(new Date(today[0].start).getHours(), 8);
  assert.equal(new Date(today[0].end).getMinutes(), 30);
});

test("a day without lessons gives an empty list, while a missing or broken cache gives null", () => {
  const now = new Date(2026, 10, 21, 12, 0);
  const cache = buildLessonsCache([{ date: "2026-11-19", start: "08:00", end: "09:00", subject: "X" }], LOCAL_ZONE, now);
  assert.deepEqual(todayLessons(cache, now), []);
  assert.equal(todayLessons(undefined, now), null);
  assert.equal(todayLessons({ lessons: "nej", timeZone: "UTC" }, now), null);
  assert.equal(todayLessons({ lessons: [{ date: "2026-11-21", start: "08:00", end: "09:00", subject: "X" }], timeZone: "Ikke/EnZone" }, now), null);
});
