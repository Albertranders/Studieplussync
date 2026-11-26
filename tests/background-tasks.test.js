// Hele baggrundsflowet for Google Tasks mod en falsk Google Tasks (ingen rigtige data, ingen netværk).
import test from "node:test";
import assert from "node:assert/strict";
const store = {};                                   // chrome.storage.local
const noop = () => {};
const listeners = [];
const authUrls = [];
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
  identity: {
    getRedirectURL: () => "https://x.chromiumapp.org/",
    launchWebAuthFlow: async ({ url }) => { authUrls.push(url); const state = new URL(url).searchParams.get("state"); return `https://x.chromiumapp.org/#access_token=tok&expires_in=3600&state=${state}`; }
  },
  tabs: { query: async () => [{ id: 1 }], sendMessage: (_id, message, cb) => cb({ ok: true, assignments }) }
};
// Falsk Google Tasks
const lists = []; const tasks = new Map(); let nextId = 1; const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || "GET"; url = String(url);
  calls.push(`${method} ${url.replace("https://tasks.googleapis.com/tasks/v1", "")}`);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  if (url.includes("userinfo")) return json({ email: "elev@example.com" });
  assert.equal(options.headers?.Authorization, "Bearer tok", "Authorization-header mangler");
  if (url.endsWith("/users/@me/lists?maxResults=100")) return json({ items: lists });
  if (url.endsWith("/users/@me/lists") && method === "POST") { const l = { id: "L1", ...JSON.parse(options.body) }; lists.push(l); return json(l); }
  const m = url.match(/\/lists\/(L\d+)\/tasks(?:\/([^?]+))?/);
  assert.ok(m, "ukendt URL " + url);
  if (method === "GET") return json({ items: [...tasks.values()] });
  if (method === "POST") { const t = { id: "T" + nextId++, status: "needsAction", ...JSON.parse(options.body) }; tasks.set(t.id, t); return json(t); }
  if (method === "PATCH") { const t = tasks.get(decodeURIComponent(m[2])); Object.assign(t, JSON.parse(options.body)); return json(t); }
  throw new Error("uventet kald " + method + url);
};
await import("../src/background.js");
test("Google Tasks: slå til, oprette, opdatere, afslutte og respektere brugerens ændringer", async () => {
const send = message => new Promise(resolve => { const l = listeners.find(fn => fn(message, {}, resolve) === true); if (!l) resolve("ingen handler"); });
const item = (title, day) => ({ id: title, subject: "Fysik", title, due: new Date(2026, 11, day, 22, 0).toISOString(), start: new Date(2026, 10, 24, 8, 0).toISOString(), submitted: false });
store.googleConnected = true; store.loginHint = "elev@example.com";
assignments = [item("Forsøg", 6), item("Status", 2)];

// 1. Slå til: scope bedes om, listen oprettes, begge opgaver oprettes
let r = await send({ type: "STUDIESYNC_TASKS_ENABLE" });
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.counts.created, 2);
assert.ok(new URL(authUrls.at(-1)).searchParams.get("scope").includes("auth/tasks"), "tasks-scope mangler i loginet");
assert.equal(store.tasksListId, "L1"); assert.equal(tasks.size, 2);
const created = [...tasks.values()];
assert.ok(created.every(t => /\[StudieSync:[a-z0-9]+\]/.test(t.notes) && t.due.endsWith("T00:00:00.000Z")));
assert.deepEqual(created.map(t => t.due.slice(0, 10)).sort(), ["2026-12-02", "2026-12-06"]);
console.log("1 ok: slået til, 2 oprettet →", created.map(t => t.title));

// 2. Igen uden ændringer: ingen skrivninger
calls.length = 0;
r = await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
assert.equal(store.tasksStatus.ok, true); assert.deepEqual(store.tasksStatus.counts, { created: 0, updated: 0, completed: 0, skipped: 0, unchanged: 2 });
assert.ok(!calls.some(c => c.startsWith("POST") || c.startsWith("PATCH")), calls.join("\n"));
console.log("2 ok: idempotent, ingen skrivninger");

// 3. Én aflevering afleveret, én frist flyttet: afsluttes og opdateres
assignments = [item("Forsøg", 9)];
await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
const byTitle = t => [...tasks.values()].find(x => x.title.endsWith(t));
assert.equal(byTitle("Status").status, "completed"); assert.equal(byTitle("Forsøg").due.slice(0, 10), "2026-12-09"); assert.equal(byTitle("Forsøg").status, "needsAction");
console.log("3 ok: afsluttet og opdateret →", JSON.stringify(store.tasksStatus.counts));

// 4. Brugeren sletter en opgave: den oprettes ikke igen. Brugeren afslutter en: den genåbnes ikke.
tasks.delete(byTitle("Forsøg").id);
assignments = [item("Forsøg", 9), { ...item("Nyt", 12) }];
await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
assert.equal([...tasks.values()].filter(t => t.title.endsWith("Forsøg")).length, 0, "slettet opgave blev genoprettet");
assert.equal(byTitle("Nyt").status, "needsAction"); assert.equal(store.tasksStatus.counts.skipped, 1);
byTitle("Nyt").status = "completed";
await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
assert.equal(byTitle("Nyt").status, "completed");
console.log("4 ok: slettet genoprettes ikke, afsluttet genåbnes ikke");

// 5. Listen slettes i Google (fx en anden konto): ny liste oprettes én gang
lists.length = 0; tasks.clear(); const realFetch = fetch; let first = true;
globalThis.fetch = async (url, options) => { if (first && String(url).includes("/lists/L1/tasks") && !(options?.method)) { first = false; return new Response("{}", { status: 404 }); } return realFetch(url, options); };
await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
assert.equal(store.tasksStatus.ok, true, JSON.stringify(store.tasksStatus));
console.log("5 ok: slettet liste håndteres →", JSON.stringify(store.tasksStatus.counts));

// 6. Slået fra: ingen kald
globalThis.fetch = async () => { throw new Error("ingen kald forventet"); };
store.tasksSync = false;
await send({ type: "STUDIESYNC_REFRESH_ASSIGNMENTS" });
console.log("6 ok: ingen kald, når det er slået fra");
});
