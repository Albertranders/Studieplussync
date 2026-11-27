// Baggrundsflowet for lektionsnotifikationer mod en falsk Google Kalender (ingen rigtige data, ingen netværk).
import test from "node:test";
import assert from "node:assert/strict";
const store = {};
const noop = () => {};
const listeners = [];
let lessons = [];
globalThis.chrome = {
  runtime: { onInstalled: { addListener: noop }, onStartup: { addListener: noop }, onMessage: { addListener: fn => listeners.push(fn) }, getManifest: () => ({ version: "test" }), lastError: undefined },
  alarms: { onAlarm: { addListener: noop }, create: noop, clear: async () => true, get: async () => null },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
  storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in store).map(k => [k, structuredClone(store[k])])),
    set: async v => { Object.assign(store, structuredClone(v)); },
    remove: async keys => { for (const k of [].concat(keys)) delete store[k]; }
  } },
  identity: { getRedirectURL: () => "https://x.chromiumapp.org/", launchWebAuthFlow: async () => { throw new Error("intet login forventet"); } },
  tabs: { query: async () => [{ id: 1 }], sendMessage: (_id, message, cb) => cb(message.type === "STUDIESYNC_READ_SCHEDULE"
    ? { ok: true, lessons, dateRange: { start: "2026-12-01", end: "2026-12-04" }, pageTitle: "Skema" }
    : { ok: true, assignments: [] }) }
};
const events = new Map(); const calls = []; let nextId = 1;
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || "GET"; const path = String(url).replace("https://www.googleapis.com/calendar/v3", "");
  calls.push(`${method} ${path.split("?")[0]}`);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  if (path === "/calendars" && method === "POST") return json({ id: "CAL1" });
  const m = path.match(/^\/calendars\/CAL1\/events(?:\/([^?]+))?/);
  assert.ok(m, "ukendt URL " + method + " " + path);
  if (method === "GET") return json({ items: [...events.values()] });
  if (method === "POST") { const e = { id: "E" + nextId++, ...JSON.parse(options.body) }; events.set(e.id, e); return json(e); }
  if (method === "PATCH") {
    const e = events.get(decodeURIComponent(m[1])); const body = JSON.parse(options.body);
    const { extendedProperties, ...rest } = body; Object.assign(e, rest);
    if (extendedProperties) e.extendedProperties = { private: { ...e.extendedProperties.private, ...extendedProperties.private } };
    return json({});
  }
  if (method === "DELETE") { events.delete(decodeURIComponent(m[1])); return new Response(null, { status: 204 }); }
  throw new Error("uventet kald " + method + path);
};
await import("../src/background.js");
const send = message => new Promise(resolve => { const l = listeners.find(fn => fn(message, {}, resolve) === true); if (!l) resolve("ingen handler"); });
const wait = async (condition, ms = 5000) => { const end = Date.now() + ms; while (!condition()) { if (Date.now() > end) throw new Error("timeout"); await new Promise(r => setTimeout(r, 10)); } };
const L = (id, start, end, date = "2026-12-01") => ({ id, date, start, end, subject: "Mat", room: "", teacher: "", homework: "", note: "" });
const mins = id => { const e = [...events.values()].find(x => x.extendedProperties.private.studiesyncKey === id); return e.reminders?.useDefault === false ? e.reminders.overrides.map(o => o.minutes) : "standard"; };

test("lektionsnotifikationer: fra som standard, til (første/alle) og fra igen nulstiller kun vores egne", async () => {
  Object.assign(store, { googleConnected: true, loginHint: "elev@example.com", webToken: { token: "tok", expiresAt: Date.now() + 3600e3 } });
  lessons = [L("a", "10:00", "11:00"), L("b", "08:00", "09:00"), L("c", "09:00", "10:00", "2026-12-02")];

  // 1. Fra som standard: ingen egne notifikationer på eventsene
  await send({ type: "STUDIESYNC_SYNC" });
  assert.equal(events.size, 3);
  assert.deepEqual(["a", "b", "c"].map(mins), ["standard", "standard", "standard"]);
  assert.equal(store.lessonRemindersApplied, "off");

  // 2. Slå til (kun første lektion, 15 og 5 min): kun dagens første får notifikation, de andre får ingen
  await chrome.storage.local.set({ lessonReminders: true, lessonReminderMinutes: [15, 5], lessonReminderScope: "first" });
  await send({ type: "STUDIESYNC_SETTINGS_CHANGED" });
  await wait(() => mins("b") !== "standard");
  assert.deepEqual(["a", "b", "c"].map(mins), [[], [15, 5], [15, 5]]);
  await wait(() => store.lessonRemindersApplied !== "off");

  // 3. Uændret indstilling: ingen skrivninger ved næste synkronisering
  calls.length = 0;
  await send({ type: "STUDIESYNC_SYNC" });
  assert.ok(!calls.some(c => /^(POST|PATCH|DELETE)/.test(c)), calls.join("\n"));

  // 4. Alle lektioner
  await chrome.storage.local.set({ lessonReminderScope: "all" });
  await send({ type: "STUDIESYNC_SETTINGS_CHANGED" });
  await wait(() => mins("a") !== "standard" && (mins("a").length > 0));
  assert.deepEqual(["a", "b", "c"].map(mins), [[15, 5], [15, 5], [15, 5]]);
  await wait(() => store.lessonRemindersApplied.includes("all"));

  // 5. Slået fra: kalenderens standard gælder igen,
  await chrome.storage.local.set({ lessonReminders: false });
  await send({ type: "STUDIESYNC_SETTINGS_CHANGED" });
  await wait(() => ["a", "b", "c"].every(id => mins(id) === "standard"));
  await wait(() => store.lessonRemindersApplied === "off");
});
