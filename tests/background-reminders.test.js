// Hele baggrundsflowet for kalenderpåmindelser mod en falsk Google Kalender (ingen rigtige data, ingen netværk).
import test from "node:test";
import assert from "node:assert/strict";
const store = {};
const noop = () => {};
const listeners = [];
let assignments = [];
globalThis.chrome = {
  runtime: { onInstalled: { addListener: noop }, onStartup: { addListener: noop }, onMessage: { addListener: fn => listeners.push(fn) }, getManifest: () => ({ version: "test" }), lastError: undefined, sendMessage: noop },
  alarms: { onAlarm: { addListener: noop }, create: noop, clear: async () => true, get: async () => null },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
  storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in store).map(k => [k, structuredClone(store[k])])),
    set: async v => { Object.assign(store, structuredClone(v)); },
    remove: async keys => { for (const k of [].concat(keys)) delete store[k]; }
  } },
  identity: { getRedirectURL: () => "https://x.chromiumapp.org/", launchWebAuthFlow: async () => { throw new Error("intet login forventet"); } },
  tabs: { query: async () => [{ id: 1 }], sendMessage: (_id, message, cb) => cb({ ok: true, assignments }) }
};
// Falsk Google Kalender
const events = new Map(); const calls = []; const calendarPatches = []; let created = null; let nextId = 1;
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || "GET"; url = String(url);
  const path = url.replace("https://www.googleapis.com/calendar/v3", "");
  calls.push(`${method} ${path.split("?")[0]}`);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  assert.equal(options.headers?.Authorization, "Bearer tok", "Authorization-header mangler");
  if (path === "/calendars" && method === "POST") { created = { id: "CAL1", ...JSON.parse(options.body) }; return json(created); }
  if (path === "/users/me/calendarList/CAL1" && method === "PATCH") { calendarPatches.push(JSON.parse(options.body)); return json({}); }
  const m = path.match(/^\/calendars\/CAL1\/events(?:\/([^?]+))?/);
  assert.ok(m, "ukendt URL " + method + " " + path);
  if (method === "GET") { assert.match(path, /privateExtendedProperty=studiesyncKind%3Dassignment/); return json({ items: [...events.values()] }); }
  if (method === "POST") { const e = { id: "E" + nextId++, ...JSON.parse(options.body) }; events.set(e.id, e); return json(e); }
  if (method === "PATCH") { Object.assign(events.get(decodeURIComponent(m[1])), JSON.parse(options.body)); return json({}); }
  if (method === "DELETE") { events.delete(decodeURIComponent(m[1])); return new Response(null, { status: 204 }); }
  throw new Error("uventet kald " + method + path);
};
await import("../src/background.js");
const send = message => new Promise(resolve => { const l = listeners.find(fn => fn(message, {}, resolve) === true); if (!l) resolve("ingen handler"); });
const wait = async (condition, ms = 5000) => { const end = Date.now() + ms; while (!condition()) { if (Date.now() > end) throw new Error("timeout: " + condition.toString() + " | begivenheder: " + JSON.stringify(kinds()) + " | status: " + JSON.stringify(store.remindersStatus) + " | indstillinger: " + JSON.stringify({ nag: store.assignmentNag, min: store.assignmentReminderMinutes })); await new Promise(r => setTimeout(r, 25)); } };
// Frister i fremtiden (relativt til nu), så testen ikke bliver forældet.
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(22, 0, 0, 0); return d.toISOString(); };
const START = new Date(Date.now() - 864e5).toISOString(); // fast, som i virkelige data (indgår i opgavens nøgle)
const item = (title, inDays) => ({ id: title, subject: "Fysik", title, due: day(inDays), start: START, submitted: false });
const kinds = () => [...events.values()].map(e => `${e.extendedProperties.private.studiesyncRole}:${e.summary}`).sort();

test("kalenderpåmindelser: oprette, skjule, slette ved aflevering og ved slukning, og respektere brugerens sletning", async () => {
  Object.assign(store, { googleConnected: true, loginHint: "elev@example.com", webToken: { token: "tok", expiresAt: Date.now() + 3600e3 }, assignmentReminders: true });
  assignments = [item("Forsøg", 5), item("Status", 3)];

  // 1. Første hentning: kalenderen oprettes og skjules; hver aflevering får en frist og en daglig påmindelse
  await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
  assert.equal(store.remindersStatus.ok, true, JSON.stringify(store.remindersStatus));
  assert.equal(created.summary, "Studie+ afleveringer");
  assert.deepEqual(calendarPatches, [{ selected: false }]);
  assert.deepEqual(kinds(), ["deadline:Frist: Fysik: Forsøg", "deadline:Frist: Fysik: Status", "overdue:Forfalden: Fysik: Forsøg", "overdue:Forfalden: Fysik: Status"]);
  const deadline = [...events.values()].find(e => e.summary === "Frist: Fysik: Forsøg");
  assert.equal(new Date(deadline.end.dateTime) - new Date(deadline.start.dateTime), 15 * 60000);
  assert.deepEqual(deadline.reminders.overrides.map(o => o.minutes), [4320, 1440, 120]);
  assert.ok(deadline.reminders.overrides.every(o => o.method === "popup") && deadline.reminders.useDefault === false);
  const nag = [...events.values()].find(e => e.summary === "Forfalden: Fysik: Forsøg");
  assert.deepEqual(nag.recurrence, ["RRULE:FREQ=DAILY;COUNT=14"]);
  assert.ok(new Date(nag.start.dateTime + "Z") > new Date(deadline.start.dateTime) - 864e5, "den daglige påmindelse starter efter fristen");
  console.log("1 ok:", kinds().length, "begivenheder, kalender skjult");

  // 2. Igen uden ændringer: ingen skrivninger
  calls.length = 0;
  await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
  assert.ok(!calls.some(c => /^(POST|PATCH|DELETE)/.test(c)), calls.join("\n"));
  assert.deepEqual(store.remindersStatus.counts, { created: 0, updated: 0, deleted: 0, skipped: 0, unchanged: 4 });
  assert.equal(calendarPatches.length, 1, "kalenderens synlighed ændres kun, når valget ændres");

  // 2b. Brugeren vælger andre tidspunkter og 30 dages daglig påmindelse: eksisterende begivenheder opdateres (ingen nye)
  Object.assign(store, { assignmentReminderMinutes: [60, 1440], assignmentNagDays: 30 });
  await send({ type: "STUDIESYNC_SETTINGS_CHANGED" });
  await wait(() => store.remindersStatus.counts.updated === 4);
  assert.equal(events.size, 4);
  for (const e of events.values()) {
    if (e.extendedProperties.private.studiesyncRole === "deadline") assert.deepEqual(e.reminders.overrides.map(o => o.minutes), [1440, 60]);
    else assert.deepEqual(e.recurrence, ["RRULE:FREQ=DAILY;COUNT=30"]);
  }
  console.log("2b ok: tidspunkter og antal dage opdateret");

  // 2c. Den daglige påmindelse slås fra (de to serier slettes) og til igen (de oprettes igen)
  store.assignmentNag = false;
  await send({ type: "STUDIESYNC_SETTINGS_CHANGED" });
  await wait(() => kinds().length === 2 && kinds().every(k => k.startsWith("deadline")));
  store.assignmentNag = true;
  await send({ type: "STUDIESYNC_SETTINGS_CHANGED" });
  await wait(() => kinds().length === 4);
  console.log("2c ok: daglig påmindelse fra og til");

  // 3. En aflevering er afleveret: begge begivenheder slettes
  assignments = [item("Forsøg", 5)];
  await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
  assert.deepEqual(kinds(), ["deadline:Frist: Fysik: Forsøg", "overdue:Forfalden: Fysik: Forsøg"]);
  assert.equal(store.remindersStatus.counts.deleted, 2);

  // 4. Brugeren sletter en begivenhed: den oprettes ikke igen
  events.delete([...events.values()].find(e => e.summary.startsWith("Frist")).id);
  await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
  assert.deepEqual(kinds(), ["overdue:Forfalden: Fysik: Forsøg"]);
  assert.equal(store.remindersStatus.counts.skipped, 1);

  // 5. Kalenderen vises igen, når "skjul" slås fra
  store.hideReminderCalendar = false;
  await send({ type: "STUDIESYNC_SETTINGS_CHANGED" });
  await wait(() => calendarPatches.length === 2);
  assert.deepEqual(calendarPatches[1], { selected: true });

  // 6. Slået fra: alle vores begivenheder ryddes op, og senere synkroniseringer gør ingenting
  store.assignmentReminders = false;
  await send({ type: "STUDIESYNC_SETTINGS_CHANGED" });
  await wait(() => events.size === 0);
  await wait(() => store.remindersActive === false);
  calls.length = 0;
  await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
  assert.equal(calls.length, 0, "ingen kald, når påmindelser er slået fra og ryddet op: " + calls.join(", "));
});
