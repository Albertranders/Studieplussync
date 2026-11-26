// Service worker coordinating Google sign-in, calendar requests, and schedule synchronization.
import { buildPlan, contentHash, eventBody, isSafeSchedule, isSuspiciousDrop, MANAGED_HASH, MANAGED_KEY } from "./sync.js";
import "./config.js"; // Load shared extension settings.
import "./errors.js"; // Load shared error codes and status helpers.
import { buildAuthUrl, isConnected, isTokenFresh, parseAuthRedirect, REVOKE_URL, USERINFO_URL, withTokenRetry } from "./auth.js";
import { resolveSettings } from "./settings.js";
import { appendHistory, createHistoryEntry } from "./history.js";
import { createSyncLock } from "./sync-lock.js";
import { addPartialProgressToStatus, createSyncProgress } from "./sync-progress.js";
import { runWithLimit } from "./concurrency.js";
import { buildLessonsCache } from "./lessons-cache.js";
import { buildAssignmentsCache } from "./assignments.js";
import { assignmentKey, planTasks, rememberKeys, TASKS_API, TASKS_LIST_TITLE } from "./tasks.js";
import { planReminders, REMINDER_KIND, REMINDER_KIND_KEY, rememberRefs } from "./reminders.js";
import { isQuietFailure, shouldSyncOnOpen } from "./open-sync.js";

// The configured web OAuth client must allow chrome.identity's redirect URL.
const CONFIG = globalThis.STUDIESYNC_CONFIG; // Shared defaults and integration settings.
const CLIENT_ID = CONFIG.googleClientId;

const ALARM_NAME = "studiesync-auto-sync";
const syncLock = createSyncLock(); // Serialize manual and scheduled sync requests.

// Indstillinger: standardværdierne fra config.js, med det brugeren har valgt i menuen "Indstillinger" ovenpå
async function getSettings() {
  return resolveSettings(
    await storageGet(["scheduleWeeks", "autoSync", "autoSyncMinutes", "calendarName", "timeZone", "tasksSync", "assignmentReminders", "hideReminderCalendar"]),
    CONFIG
  );
}

// --- Små hjælpere til lagring og status ---

// Læser værdier fra udvidelsens lokale lager
function storageGet(keys) {
  return chrome.storage.local.get(keys);
}
// Gemmer værdier i udvidelsens lokale lager
function storageSet(values) {
  return chrome.storage.local.set(values);
}
// Viser en rød advarselsmarkering på udvidelsens ikon ved fejl.
async function updateActionStatus(status) {
  if (status?.ok === false) {
    await chrome.action.setBadgeBackgroundColor({ color: "#D93025" });
    await chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
    await chrome.action.setBadgeText({ text: "!" });
  } else if (status?.ok === true) {
    await chrome.action.setBadgeText({ text: "" });
  }
}

// Genskab markeringen, når browseren starter eller service worker vågner.
async function restoreActionStatus() {
  const { lastStatus } = await storageGet(["lastStatus"]);
  if (lastStatus) await updateActionStatus(lastStatus);
}

// Gemmer seneste status og opdaterer browserikonets fejlmarkering.
async function sendStatus(status) {
  await storageSet({ lastStatus: status, lastUpdated: new Date().toISOString() });
  await updateActionStatus(status);
}

let historyWriteQueue = Promise.resolve();
function recordSyncHistory(status, trigger) {
  historyWriteQueue = historyWriteQueue.then(async () => {
    const { syncHistory = [] } = await storageGet(["syncHistory"]);
    await storageSet({ syncHistory: appendHistory(syncHistory, createHistoryEntry(status, trigger)) });
  }).catch(error => console.warn("Kunne ikke gemme synkroniseringshistorik:", error));
  return historyWriteQueue;
}
// Bygger fuld URL til Google Calendar API
function calendarUrl(path) {
  return `https://www.googleapis.com/calendar/v3${path}`;
}

// --- Google-login ---

// Henter et OAuth-token. `interactive` = må der vises et login-vindue?
// Alle Chromium-browsere (Chrome, Opera, Edge) bruger det samme OAuth-vindue.
async function googleToken(interactive) {
  return webAuthFlowToken(interactive);
}

// Beder Google om et nyt token. `interactive` = må der vises et login-vindue?
// `selectAccount` = vis kontovælgeren (ved første forbindelse og ved "Skift Google-konto").
async function requestToken(interactive, selectAccount = false) {
  const { loginHint, tasksSync } = await storageGet(["loginHint", "tasksSync"]);
  const state = crypto.randomUUID();
  const url = buildAuthUrl({
    clientId: CLIENT_ID,
    redirectUri: chrome.identity.getRedirectURL(),
    state,
    interactive,
    loginHint,
    selectAccount,
    tasks: tasksSync === true // ekstra scope, kun når brugeren har slået Google Tasks til
  });
  let redirectUrl;
  try {
    redirectUrl = await chrome.identity.launchWebAuthFlow({ url, interactive });
  } catch (error) {
    throw new StudySyncError("E102", error?.message || "Google-login mislykkedes.");
  }
  const fresh = parseAuthRedirect(redirectUrl, state);
  await storageSet({ webToken: fresh, googleConnected: true });
  if (!loginHint || selectAccount) await rememberAccount(fresh.token);
  return fresh.token;
}

// Gemmer e-mailen på den konto, der loggede ind, så fremtidige fornyelser kan ske stille.
// Fejler det, gør det ikke noget: så virker alt som før, bare uden e-mail-tip.
async function rememberAccount(token) {
  try {
    const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const { email } = await response.json();
    if (email) await storageSet({ loginHint: email });
  } catch {
    // ignoreres bevidst
  }
}

// Login via `launchWebAuthFlow` (virker i alle Chromium-browsere).
// Tokenet gemmes, til det udløber (Google giver ca. 1 time). Når det er udløbet, prøver vi først
// en STILLE fornyelse (uden vindue, virker hvis du allerede er logget ind på Google i browseren).
// Kun hvis den fejler, og vi må vise noget (knaptryk), åbnes login-vinduet.
async function webAuthFlowToken(interactive) {
  const { webToken, googleConnected, loginHint } = await storageGet(["webToken", "googleConnected", "loginHint"]);
  if (CLIENT_ID.startsWith("INSERT")) {
    throw new StudySyncError("E101", "Mangler Client ID. Udfyld googleClientId i config.js (se README).");
  }
  // Ingen forbundet konto (ny installation eller efter "Log ud af Google"): Google må aldrig
  // forbindes i baggrunden. Kun et knaptryk (Forbind Google Kalender) åbner login med kontovælger.
  if (!isConnected({ googleConnected, loginHint, webToken })) {
    if (!interactive) throw new StudySyncError("E201", "Ingen Google-konto er forbundet.");
    return requestToken(true, true);
  }
  if (isTokenFresh(webToken)) return webToken.token;
  try {
    return await requestToken(false);
  } catch (error) {
    if (!interactive) throw error;
  }
  return requestToken(true);
}

// Er en Google-konto forbundet, og hvilken? (til menuen i popup'en)
async function authState() {
  const stored = await storageGet(["googleConnected", "loginHint", "webToken"]);
  return { connected: isConnected(stored), email: stored.loginHint || "" };
}

// "Log ud af Google": tilbagekalder adgangen hos Google og glemmer token og e-mail lokalt.
// Kalenderen i Google og kalender-id'et beholdes, så samme konto kan forbindes igen uden en dublet.
async function logoutGoogle() {
  const { webToken } = await storageGet(["webToken"]);
  await storageSet({ googleConnected: false });
  if (webToken?.token) {
    try {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(webToken.token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
    } catch {
      // offline eller allerede udløbet: tokenet glemmes alligevel lokalt
    }
  }
  await chrome.storage.local.remove(["webToken", "loginHint"]);
  await chrome.action.setBadgeText({ text: "" });
}

// "Skift Google-konto": vælg en anden konto i Googles kontovælger. Afbrydes login, bliver den
// nuværende konto ved med at være forbundet. Er den nye konto en anden, findes kalender-id'et
// ikke dér (404), og en ny "Studie+ skema"-kalender oprettes (se ensureCalendar).
async function switchGoogleAccount() {
  await requestToken(true, true);
}

// --- Kald til Google Calendar med automatisk genforsøg ---

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const WRITE_DELAY_MS = CONFIG.writeDelayMs;   // pause mellem skrivninger, så Google ikke rate-limiter
const WRITE_CONCURRENCY = Math.max(1, Math.round(Number(CONFIG.writeConcurrency) || 1)); // skrivninger på én gang
const MAX_TRIES = CONFIG.maxTries;          // maks. antal forsøg pr. kald
let cooldownUntil = 0;                      // fælles pause, når Google beder os sænke farten

// Er svaret en "du kalder for hurtigt"-fejl fra Google?
function isRateLimited(status, body) {
  return status === 429 || (status === 403 && /rate\s*limit|quota/i.test(body));
}

// Vælger fejlkode ud fra Googles svar
function googleErrorCode(status, body, tasks = false) {
  if (tasks && status === 403 && /SERVICE_DISABLED|has not been used|is disabled/i.test(body)) return "E208";
  if (tasks && status === 403 && /insufficient|scope/i.test(body)) return "E207";
  if (isRateLimited(status, body)) return "E204";
  if (status === 401) return "E201";
  if (status === 403) return "E202";
  if (status === 404 || status === 410) return "E203";
  if (status >= 500) return "E205";
  return "E206";
}

// Udfører ét kald mod Google Calendar. Prøver igen ved rate limit og serverfejl (5xx)
async function googleRequest(token, path, options = {}) {
  for (let attempt = 1; ; attempt++) {
    // Beder Google os vente, venter alle parallelle kald, så de ikke alle rammer grænsen igen.
    const pause = cooldownUntil - Date.now();
    if (pause > 0) await sleep(pause);
    const response = await fetch(path.startsWith("https://") ? path : calendarUrl(path), {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (response.ok) {
      if (response.status === 204) return null; // "intet indhold" (fx ved sletning)
      return response.json();
    }
    const body = await response.text();
    if (response.status === 401) await storageSet({ webToken: null });   // afvist token: forny næste gang
    const retryable = isRateLimited(response.status, body) || response.status >= 500;
    // Giv op hvis fejlen ikke kan genforsøges, eller vi har brugt alle forsøg
    if (!retryable || attempt >= MAX_TRIES) {
      const tasks = path.startsWith(TASKS_API);
      const failure = new StudySyncError(googleErrorCode(response.status, body, tasks), `${tasks ? "Google Tasks" : "Google Kalender"} (${response.status}): ${body.slice(0, 300)}`);
      failure.status = response.status;
      throw failure;
    }
    // Vent så længe Google beder om, ellers eksponentiel ventetid (maks. 30 sek.) + lidt tilfældighed
    const retryAfter = Number(response.headers.get("Retry-After"));
    const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30000);
    if (isRateLimited(response.status, body)) cooldownUntil = Math.max(cooldownUntil, Date.now() + wait);
    await sleep(wait + Math.random() * 500);
  }
}

// --- Kalender og events ---

// Finder id'et på vores kalender (gemt fra sidst) eller opretter den.
// Den gemte kalender kan være slettet, eller være oprettet af en anden OAuth-klient (fx Chrome vs. Opera),
// som scopet calendar.app.created ikke kan se (404). Det opdages, når events hentes (se performSyncNow),
// så der ikke bruges et ekstra kald til Google ved hver synkronisering.
async function ensureCalendar(token) {
  const { calendarId } = await storageGet(["calendarId"]);
  if (calendarId) return calendarId;
  const { calendarName, timeZone } = await getSettings();
  const created = await googleRequest(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: calendarName, timeZone })
  });
  await storageSet({ calendarId: created.id });
  return created.id;
}

// Henter alle events i perioden, som er oprettet af os (har vores skjulte nøgle)
async function getManagedEvents(token, calendarId, timeMin, timeMax) {
  const events = [];
  let pageToken = "";
  // Google leverer resultater i sider; fortsæt til der ikke er flere
  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "false",
      maxResults: "2500",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString()
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    events.push(...(result.items || []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  // Behold kun vores egne events, så personlige events aldrig røres
  return events.filter(event => event.extendedProperties?.private?.[MANAGED_KEY]);
}

// Henter dagens lektioner (hele dagen, også dem der er overstået) fra den kalender, StudieSync selv administrerer.
async function dashboardData() {
  const { calendarId } = await storageGet(["calendarId"]);
  if (!calendarId) return { todayLessons: [] };
  const result = await withTokenRetry(() => googleToken(false), token => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const params = new URLSearchParams({
      singleEvents: "true", showDeleted: "false", orderBy: "startTime",
      maxResults: "50", timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString()
    });
    return googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  });
  const todayLessons = (result.items || [])
    .filter(event => event.start?.dateTime) // heldagsbegivenheder er ikke lektioner
    .map(event => ({
      summary: event.summary || "Lektion",
      start: event.start.dateTime,
      end: event.end?.dateTime || "",
      location: event.location || ""
    }));
  return { todayLessons };
}

// --- Kommunikation med Studie+-fanen ---

// Finder en åben, ikke-sovende Studie+-fane (content-scriptet kører dér)
async function findStudyPlusTab() {
  const tabs = await chrome.tabs.query({
    url: ["https://all.uddataplus.dk/*", "https://all.studieplus.dk/*"]
  });
  return tabs.find(tab => tab.id != null && !tab.discarded) || null;
}

// Antal uger der skal hentes (valgt i Indstillinger), begrænset af maxWeeks i config.js
async function scheduleWeeks() {
  return (await getSettings()).scheduleWeeks;
}

// Sender en besked til content-scriptet i fanen og venter på svar
const TAB_TIMEOUT_MS = 120000; // giv op efter 2 minutter, så en synkronisering aldrig hænger for evigt
function sendTabMessage(tab, type, weeks) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new StudySyncError("E302", "Studie+-siden svarede ikke i tide.")), TAB_TIMEOUT_MS);
    chrome.tabs.sendMessage(tab.id, { type, weeks }, response => {
      clearTimeout(timer);
      const error = chrome.runtime.lastError;
      if (error) reject(new StudySyncError("E302", error.message));
      else if (!response?.ok) reject(response?.error ? new Error(response.error) : new StudySyncError("E302", "Tomt svar fra Studie+-siden."));
      else resolve(response);
    });
  });
}

// --- Google Tasks ---
// Afleveringerne lægges i en egen opgaveliste. Andre lister og opgaver uden vores markør røres aldrig.

// Finder vores liste (gemt id, ellers på navn fra en tidligere installation) eller opretter den.
async function ensureTasksList(token) {
  const { tasksListId } = await storageGet(["tasksListId"]);
  if (tasksListId) return tasksListId;
  const lists = await googleRequest(token, `${TASKS_API}/users/@me/lists?maxResults=100`);
  let id = (lists.items || []).find(list => list.title === TASKS_LIST_TITLE)?.id;
  if (!id) {
    const created = await googleRequest(token, `${TASKS_API}/users/@me/lists`, { method: "POST", body: JSON.stringify({ title: TASKS_LIST_TITLE }) });
    id = created.id;
  }
  await storageSet({ tasksListId: id, tasksKnown: {} });
  return id;
}

// Alle opgaver i listen, også afsluttede (ellers ville en afsluttet opgave se ud, som om den var slettet).
async function listTasks(token, listId) {
  const items = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ showCompleted: "true", showHidden: "true", maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await googleRequest(token, `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks?${params}`);
    items.push(...(result.items || []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return items;
}

// Én synkronisering af afleveringerne til Google Tasks. Returnerer { skipped } eller { counts }.
async function syncTasksOnce() {
  const settings = await getSettings();
  if (!settings.tasksSync) return { skipped: true };
  const stored = await storageGet(["assignmentsCache", "googleConnected", "loginHint", "webToken"]);
  const all = stored.assignmentsCache?.assignments;
  const open = Array.isArray(all) ? all.filter(item => !item.submitted) : [];
  // Ingen forbundet konto, ingen hentede afleveringer endnu, eller en ældre kopi uden startdato: vent på friske data.
  if (!isConnected(stored) || !Array.isArray(all) || open.some(item => !item.start)) return { skipped: true };
  const counts = await withTokenRetry(() => googleToken(false), async token => {
    let listId, existing;
    for (let attempt = 0; ; attempt++) {
      listId = await ensureTasksList(token);
      try { existing = await listTasks(token, listId); break; } catch (error) {
        // Listen er slettet, eller kontoen er en anden: glem den, og opret en ny én gang.
        if (error?.status !== 404 || attempt > 0) throw error;
        await chrome.storage.local.remove(["tasksListId", "tasksKnown"]);
      }
    }
    const { tasksKnown } = await storageGet(["tasksKnown"]);
    const plan = planTasks({ open, existing, known: tasksKnown, timeZone: settings.timeZone });
    const base = `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`;
    const created = {};
    const result = { created: 0, updated: 0, completed: 0, skipped: plan.skipped, unchanged: plan.unchanged };
    const jobs = [
      ...plan.create.map(job => async () => {
        const task = await googleRequest(token, base, { method: "POST", body: JSON.stringify(job.body) });
        created[job.key] = task.id; result.created++;
      }),
      ...plan.update.map(job => async () => {
        await googleRequest(token, `${base}/${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify(job.body) });
        result.updated++;
      }),
      ...plan.complete.map(job => async () => {
        await googleRequest(token, `${base}/${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
        result.completed++;
      })
    ];
    try {
      await runWithLimit(jobs, WRITE_CONCURRENCY, async run => { await run(); await sleep(WRITE_DELAY_MS); });
    } finally {
      // Husk de oprettede opgaver, også ved en fejl midtvejs, så de ikke oprettes to gange.
      if (Object.keys(created).length) await storageSet({ tasksKnown: rememberKeys(tasksKnown, created) });
    }
    return result;
  });
  return { counts };
}

// Altid kun én synkronisering ad gangen. Fejl gemmes som status og kaster aldrig videre, så de ikke vælter noget andet.
let tasksSyncRun = null;
function syncTasks() {
  if (tasksSyncRun) return tasksSyncRun;
  tasksSyncRun = (async () => {
    try {
      const result = await syncTasksOnce();
      if (result.skipped) return { ok: true, skipped: true };
      const status = { ok: true, at: new Date().toISOString(), counts: result.counts };
      await storageSet({ tasksStatus: status });
      return status;
    } catch (error) {
      const status = { ...STUDIESYNC_ERRORS.toStatus(error), at: new Date().toISOString() };
      await storageSet({ tasksStatus: status });
      return status;
    } finally {
      tasksSyncRun = null;
    }
  })();
  return tasksSyncRun;
}

// Brugeren har slået Google Tasks til. Google bedes om det ekstra scope, og dernæst hentes afleveringerne og lægges i Google Tasks.
async function enableTasks() {
  const stored = await storageGet(["googleConnected", "loginHint", "webToken"]);
  if (!isConnected(stored)) throw new StudySyncError("E201", "Forbind Google Kalender først.");
  const startedAt = new Date().toISOString();
  await storageSet({ tasksSync: true });
  try {
    await requestToken(true); // Google viser kun den ekstra tilladelse
  } catch (error) {
    await storageSet({ tasksSync: false });
    throw error;
  }
  const refreshed = await refreshAssignments();
  const { tasksStatus } = await storageGet(["tasksStatus"]);
  if (refreshed.ok && tasksStatus?.at >= startedAt) return tasksStatus;
  return { ok: true, pending: true }; // ingen åben Studie+-fane endnu: opgaverne oprettes ved næste hentning
}

// --- Kalenderpåmindelser for afleveringer ---
// Begivenhederne ligger i en egen kalender, så de ikke blandes med lektionerne. Kalenderen kan skjules
// (den vises så ikke i kalenderoversigten); begivenhederne beholder deres påmindelser.
const REMINDER_CALENDAR_NAME = "Studie+ afleveringer";

// Finder vores afleveringskalender (gemt id) eller opretter den. Ny kalender = nulstil huskede begivenheder.
async function ensureReminderCalendar(token) {
  const { reminderCalendarId } = await storageGet(["reminderCalendarId"]);
  if (reminderCalendarId) return reminderCalendarId;
  const { timeZone } = await getSettings();
  const created = await googleRequest(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: REMINDER_CALENDAR_NAME, description: "Påmindelser om afleveringer fra Studie+ (StudieSync).", timeZone })
  });
  await storageSet({ reminderCalendarId: created.id, reminderKnown: {}, reminderHiddenApplied: null });
  return created.id;
}

// Skjuler eller viser kalenderen i brugerens kalenderliste, når valget er ændret. Fejler det, prøves det igen næste gang.
async function applyReminderCalendarVisibility(token, calendarId, hidden) {
  const { reminderHiddenApplied } = await storageGet(["reminderHiddenApplied"]);
  if (reminderHiddenApplied === hidden) return;
  try {
    await googleRequest(token, `/users/me/calendarList/${encodeURIComponent(calendarId)}`, { method: "PATCH", body: JSON.stringify({ selected: !hidden }) });
    await storageSet({ reminderHiddenApplied: hidden });
  } catch {
    // prøves igen ved næste synkronisering
  }
}

// Alle vores påmindelsesbegivenheder (gentagende serier som én).
async function listReminderEvents(token, calendarId) {
  const events = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ showDeleted: "false", maxResults: "2500", privateExtendedProperty: `${REMINDER_KIND_KEY}=${REMINDER_KIND}` });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    events.push(...(result.items || []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return events;
}

// Én synkronisering af påmindelserne. Er de slået fra, ryddes de begivenheder op, der blev oprettet før.
async function syncRemindersOnce() {
  const settings = await getSettings();
  const stored = await storageGet(["assignmentsCache", "googleConnected", "loginHint", "webToken", "reminderCalendarId", "remindersActive"]);
  if (!isConnected(stored)) return { skipped: true };
  let open = [];
  if (settings.assignmentReminders) {
    const all = stored.assignmentsCache?.assignments;
    // Ingen hentede afleveringer endnu, eller en ældre kopi uden startdato: vent på friske data.
    if (!Array.isArray(all)) return { skipped: true };
    open = all.filter(item => !item.submitted);
    if (open.some(item => !item.start)) return { skipped: true };
  } else if (!stored.remindersActive || !stored.reminderCalendarId) {
    return { skipped: true };
  }
  const counts = await withTokenRetry(() => googleToken(false), async token => {
    let calendarId, existing;
    for (let attempt = 0; ; attempt++) {
      calendarId = settings.assignmentReminders ? await ensureReminderCalendar(token) : stored.reminderCalendarId;
      try { existing = await listReminderEvents(token, calendarId); break; } catch (error) {
        if (error?.status !== 404) throw error;
        // Kalenderen er slettet, eller kontoen er en anden: glem den.
        await chrome.storage.local.remove(["reminderCalendarId", "reminderKnown", "reminderHiddenApplied"]);
        if (!settings.assignmentReminders) { await storageSet({ remindersActive: false }); return { created: 0, updated: 0, deleted: 0, skipped: 0, unchanged: 0 }; }
        if (attempt > 0) throw error;
      }
    }
    if (settings.assignmentReminders) await applyReminderCalendarVisibility(token, calendarId, settings.hideReminderCalendar);
    const { reminderKnown } = await storageGet(["reminderKnown"]);
    const plan = planReminders({ open, existing, known: reminderKnown, timeZone: settings.timeZone, now: Date.now() });
    const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
    const wanted = new Set(open.flatMap(item => [`${assignmentKey(item)}:deadline`, `${assignmentKey(item)}:overdue`]));
    const created = {}, removed = [];
    const result = { created: 0, updated: 0, deleted: 0, skipped: plan.skipped, unchanged: plan.unchanged };
    const jobs = [
      ...plan.create.map(job => async () => {
        const event = await googleRequest(token, base, { method: "POST", body: JSON.stringify(job.body) });
        created[job.ref] = event.id; result.created++;
      }),
      ...plan.update.map(job => async () => {
        await googleRequest(token, `${base}/${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify(job.body) });
        result.updated++;
      }),
      ...plan.delete.map(job => async () => {
        try { await googleRequest(token, `${base}/${encodeURIComponent(job.id)}`, { method: "DELETE" }); } catch (error) {
          if (error?.status !== 404 && error?.status !== 410) throw error; // allerede slettet
        }
        if (!wanted.has(job.ref)) removed.push(job.ref); // en dublet fjerner ikke den huskede original
        result.deleted++;
      })
    ];
    try {
      await runWithLimit(jobs, WRITE_CONCURRENCY, async run => { await run(); await sleep(WRITE_DELAY_MS); });
    } finally {
      await storageSet({ reminderKnown: rememberRefs(reminderKnown, created, removed) });
    }
    await storageSet({ remindersActive: settings.assignmentReminders });
    return result;
  });
  return { counts };
}

// Kun én synkronisering ad gangen. Fejl gemmes som status og kaster aldrig videre.
let remindersSyncRun = null;
function syncReminders() {
  if (remindersSyncRun) return remindersSyncRun;
  remindersSyncRun = (async () => {
    try {
      const result = await syncRemindersOnce();
      if (result.skipped) return { ok: true, skipped: true };
      const status = { ok: true, at: new Date().toISOString(), counts: result.counts };
      await storageSet({ remindersStatus: status });
      return status;
    } catch (error) {
      const status = { ...STUDIESYNC_ERRORS.toStatus(error), at: new Date().toISOString() };
      await storageSet({ remindersStatus: status });
      return status;
    } finally {
      remindersSyncRun = null;
    }
  })();
  return remindersSyncRun;
}

// Ændrede indstillinger for påmindelser: hent friske afleveringer og synkronisér; uden åben Studie+-fane bruges kopien.
async function applyReminderSettings() {
  const settings = await getSettings();
  const { remindersActive } = await storageGet(["remindersActive"]);
  if (!settings.assignmentReminders && !remindersActive) return;
  const refreshed = await refreshAssignments();
  if (!refreshed.ok) await syncReminders();
}

// Afleveringer: hent de uafleverede opgaver fra Studie+-fanen og gem en lokal kopi til popup'en.
// Kræver kun Studie+ (ikke Google). Er ingen Studie+-fane åben, beholdes den seneste kopi uden fejl.
let assignmentsRefresh = null; // forhindrer to hentninger på samme tid
function refreshAssignments() {
  if (assignmentsRefresh) return assignmentsRefresh;
  assignmentsRefresh = (async () => {
    try {
      const tab = await findStudyPlusTab();
      if (!tab) return { ok: false, quiet: true };
      const result = await sendTabMessage(tab, "STUDIESYNC_READ_ASSIGNMENTS");
      await storageSet({ assignmentsCache: buildAssignmentsCache(result.assignments), assignmentsError: null });
      await syncTasks(); // lægger dem i Google Tasks, hvis det er slået til (fejl gemmes som status)
      await syncReminders(); // og som påmindelser i kalenderen "Studie+ afleveringer", hvis det er slået til
      return { ok: true };
    } catch (error) {
      const status = STUDIESYNC_ERRORS.toStatus(error);
      await storageSet({ assignmentsError: { code: status.code, message: status.message, at: new Date().toISOString() } });
      return { ok: false, code: status.code, message: status.message };
    } finally {
      assignmentsRefresh = null;
    }
  })();
  return assignmentsRefresh;
}

// Beder content-scriptet læse skemaet for det valgte antal uger
async function readSchedule(tab) {
  return sendTabMessage(tab, "STUDIESYNC_READ_SCHEDULE", await scheduleWeeks());
}

// "Test forbindelsen"-knappen: tjekker at Studie+ svarer, uden at røre kalenderen
async function testConnection() {
  try {
    const tab = await findStudyPlusTab();
    if (!tab) throw new StudySyncError("E301");
    const result = await sendTabMessage(tab, "STUDIESYNC_TEST_CONNECTION", await scheduleWeeks());
    const status = {
      ok: true,
      message: "Forbindelsen til Studie+ virker.",
      detail: `Session godkendt. ${result.lessonCount} lektioner fundet for ${result.dateRange.start} til ${result.dateRange.end}.`
    };
    await sendStatus(status);
    return status;
  } catch (error) {
    const status = STUDIESYNC_ERRORS.toStatus(error);
    await sendStatus(status);
    return status;
  }
}

// --- Selve synkroniseringen ---

// Udfører planen mod Google: opret, opdater og slet. Skrivningerne køres få ad gangen med en lille
// pause pr. kanal; sker der en fejl, startes intet nyt, og den første fejl kastes.
async function applyPlan(token, calendarId, plan, timeZone, progress) {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  // Tilføj de skjulte felter, så vi kan genkende eventet næste gang
  const bodyFor = item => ({
    ...eventBody(item.lesson, timeZone),
    extendedProperties: { private: { [MANAGED_KEY]: item.key, [MANAGED_HASH]: contentHash(item.lesson, timeZone) } }
  });
  const step = async (type, request) => {
    await request();
    progress.record(type);
    await sleep(WRITE_DELAY_MS);
  };
  await runWithLimit(plan.create, WRITE_CONCURRENCY, item =>
    step("created", () => googleRequest(token, base, { method: "POST", body: JSON.stringify(bodyFor(item)) })));
  await runWithLimit(plan.update, WRITE_CONCURRENCY, item =>
    step("updated", () => googleRequest(token, `${base}/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify(bodyFor(item)) })));
  await runWithLimit(plan.delete, WRITE_CONCURRENCY, id =>
    step("deleted", () => googleRequest(token, `${base}/${encodeURIComponent(id)}`, { method: "DELETE" })));
}

// Hele flowet: hent skema -> valider -> sammenlign med kalenderen -> udfør ændringer.
// `interactive` = må der vises Google-login, hvis token mangler? (false ved automatisk kørsel)
async function performSyncNow(interactive = false, trigger = "manual", quiet = false) {
  const progress = createSyncProgress();
  try {
    const tab = await findStudyPlusTab();
    if (!tab) throw new StudySyncError("E301");
    // Varm Google-tokenet op, mens skemaet hentes fra Studie+, så fornyelsen ikke ligger oveni ventetiden.
    // Fejl ignoreres her; de håndteres på normal vis, når tokenet skal bruges.
    const warmToken = googleToken(false).catch(() => {});
    const result = await readSchedule(tab);
    await warmToken;
    const lessons = result.lessons;
    // Går noget galt her, stopper vi, før kalenderen røres
    if (!isSafeSchedule(lessons)) throw new StudySyncError("E501", "Skemaet kunne ikke valideres. Kalenderen er ikke ændret.");

    // Afviser Google tokenet (401), ryddes det i googleRequest, og hele Google-delen prøves én gang
    // til med et nyt token (stille fornyelse først). Planen beregnes forfra, så et genforsøg er sikkert.
    const plan = await withTokenRetry(() => googleToken(interactive), async token => {
      let calendarId = await ensureCalendar(token);
      // Find tidsrummet skemaet dækker (første til sidste dato, inkl. sidste dag)
      // Brug den hentede periode, så lektioner der er aflyst i periodens ende også ryddes.
      const start = new Date(`${result.dateRange.start}T00:00:00`);
      const end = new Date(`${result.dateRange.end}T00:00:00`);
      end.setDate(end.getDate() + 1);
      let existing;
      try {
        existing = await getManagedEvents(token, calendarId, start, end);
      } catch (error) {
        // Kalenderen findes ikke mere (slettet, eller oprettet af en anden konto/OAuth-klient): opret en ny.
        if (error.status !== 404 && error.status !== 410) throw error;
        await storageSet({ calendarId: null });
        calendarId = await ensureCalendar(token);
        existing = await getManagedEvents(token, calendarId, start, end);
      }
      // Beskyt mod en delvis hentning, der ellers ville slette mange events
      if (isSuspiciousDrop(existing.length, lessons.length)) {
        throw new StudySyncError("E502", `Studie+: ${lessons.length} lektioner, kalender: ${existing.length}.`);
      }
      const { timeZone } = await getSettings();
      const plan = buildPlan(lessons, existing, timeZone);
      await applyPlan(token, calendarId, plan, timeZone, progress);
      return plan;
    });
    const status = {
      ok: true,
      message: `Synkroniseret: ${plan.create.length} nye, ${plan.update.length} ændrede, ${plan.delete.length} slettede, ${plan.unchanged} uændrede.`,
      counts: { lessons: lessons.length, created: plan.create.length, updated: plan.update.length, deleted: plan.delete.length, unchanged: plan.unchanged },
      pageTitle: result.pageTitle
    };
    // Gem en lokal kopi af skemaet, så popup'en kan vise dagens lektioner øjeblikkeligt.
    await storageSet({ lessonsCache: buildLessonsCache(lessons, (await getSettings()).timeZone) });
    refreshAssignments().catch(() => {}); // afleveringer opdateres med; en fejl dér må ikke vælte kalendersynkroniseringen
    await recordSyncHistory(status, trigger);
    await sendStatus(status);
    return status;
  } catch (error) {
    const status = addPartialProgressToStatus(STUDIESYNC_ERRORS.toStatus(error), progress.snapshot());
    if (error && typeof error === "object") error.syncStatus = status;
    // En synkronisering, der startede af sig selv, fordi Studie+ blev åbnet, må ikke give støj, hvis siden
    // bare ikke er klar eller logget ind endnu. Den næste synkronisering prøver igen.
    if (!(quiet && isQuietFailure(status.code))) {
      await recordSyncHistory(status, trigger);
      await sendStatus(status);
    }
    throw error;
  }
}

// Sørger for, at alarm og manuelle klik aldrig udfører samme synkronisering samtidigt.
async function syncNow(interactive = false, trigger = "manual", quiet = false) {
  const release = syncLock.tryAcquire();
  if (!release) {
    return {
      ok: false,
      busy: true,
      message: "En synkronisering er allerede i gang.",
      detail: "Vent, til den igangværende synkronisering er færdig."
    };
  }
  try {
    return await performSyncNow(interactive, trigger, quiet);
  } finally {
    release();
  }
}

// --- Hændelser ---

// Opretter alarmen for automatisk synkronisering ud fra indstillingerne (config.js + menuen
// "Indstillinger"), eller fjerner den, hvis automatisk synkronisering er slået fra.
async function applyAlarm() {
  const { autoSync, autoSyncMinutes } = await getSettings();
  await chrome.alarms.clear(ALARM_NAME);
  if (autoSync) chrome.alarms.create(ALARM_NAME, { periodInMinutes: autoSyncMinutes });
}

// Omdøber den eksisterende kalender, når navnet ændres i Indstillinger. Fejler det (fx ingen
// forbindelse), bruges det nye navn bare næste gang en kalender oprettes.
async function renameCalendar() {
  try {
    const { calendarId } = await storageGet(["calendarId"]);
    if (!calendarId) return;
    const { calendarName, timeZone } = await getSettings();
    await withTokenRetry(() => googleToken(false), token =>
      googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}`, { method: "PATCH", body: JSON.stringify({ summary: calendarName, timeZone }) }));
  } catch {
    // ignoreres bevidst
  }
}

// Ved installation og opdatering (også når den indlæses igen): opret alarmen ud fra indstillingerne
chrome.runtime.onInstalled.addListener(() => {
  applyAlarm().catch(() => {});
  restoreActionStatus().catch(() => {});
});

// Service workers kan genstartes, så genskab ikonets status fra storage.
chrome.runtime.onStartup.addListener(() => {
  applyAlarm().catch(() => {});
  restoreActionStatus().catch(() => {});
});
restoreActionStatus().catch(() => {});
// Når Studie+ åbnes: vent et øjeblik, så siden og login kan nå at blive klar, og synkronisér, hvis
// den seneste synkronisering ikke er helt ny. Flere faner, der åbner samtidigt, giver kun én kørsel.
let openSyncPending = false;
async function syncWhenStudyPlusOpens() {
  if (openSyncPending) return;
  openSyncPending = true;
  try {
    const stillDue = async () => {
      const stored = await storageGet(["googleConnected", "loginHint", "webToken", "lessonsCache"]);
      const { autoSync } = await getSettings();
      return shouldSyncOnOpen({
        autoSync, connected: isConnected(stored), lastSyncAt: stored.lessonsCache?.at,
        minAgeMs: Math.max(0, Number(CONFIG.openSyncMinAgeMinutes) || 0) * 60000
      });
    };
    if (!await stillDue()) return;
    await sleep(Math.max(0, Number(CONFIG.openSyncDelayMs) || 0));
    if (!await stillDue()) return; // en anden synkronisering nåede det i mellemtiden
    await syncNow(false, "automatic", true);
  } finally {
    openSyncPending = false;
  }
}
// Når alarmen udløses: synkronisér i baggrunden (uden login-vindue, fejl ignoreres)
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) syncNow(false, "automatic").catch(() => {});
});
// Beskeder fra popup'en. `return true` betyder, at svaret sendes asynkront
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Studie+-siden er indlæst (sendes af content.js): synkronisér efter et lille delay
  if (message?.type === "STUDIESYNC_PAGE_READY") {
    syncWhenStudyPlusOpens().catch(() => {});
    return false;
  }
  // Opdatér afleveringerne (popup'en åbner fanen Afleveringer)
  if (message?.type === "STUDIESYNC_REFRESH_ASSIGNMENTS") {
    refreshAssignments().then(sendResponse);
    return true;
  }
  // Hent seneste status til visning i popup'en
  if (message?.type === "STUDIESYNC_STATUS") {
    storageGet(["lastStatus", "lastUpdated"]).then(sendResponse);
    return true;
  }
  // Hent dagens skema til dashboardet (null = kunne ikke hentes)
  if (message?.type === "STUDIESYNC_DASHBOARD") {
    dashboardData().then(sendResponse).catch(() => sendResponse({ todayLessons: null }));
    return true;
  }
  // Hent synkroniseringshistorikken.
  if (message?.type === "STUDIESYNC_HISTORY") {
    storageGet(["syncHistory"]).then(result => sendResponse(result.syncHistory || []));
    return true;
  }
  // Test forbindelsen til Studie+
  if (message?.type === "STUDIESYNC_TEST_CONNECTION") {
    testConnection().then(sendResponse);
    return true;
  }
  // Synkronisér nu (med mulighed for Google-login)
  if (message?.type === "STUDIESYNC_SYNC") {
    syncNow(true).then(sendResponse).catch(error => sendResponse(error?.syncStatus || STUDIESYNC_ERRORS.toStatus(error)));
    return true;
  }
  // Forbind Google Kalender (viser login-vindue hvis nødvendigt)
  if (message?.type === "STUDIESYNC_CONNECT") {
    googleToken(true)
      .then(() => sendResponse({ ok: true }))
      .catch(async error => {
        const status = STUDIESYNC_ERRORS.toStatus(error);
        await sendStatus(status);
        sendResponse(status);
      });
    return true;
  }
  // Er en Google-konto forbundet, og hvilken e-mail? (til menuen)
  if (message?.type === "STUDIESYNC_AUTH_STATE") {
    authState().then(sendResponse);
    return true;
  }
  // Log ud af Google
  if (message?.type === "STUDIESYNC_LOGOUT") {
    logoutGoogle().then(() => sendResponse({ ok: true })).catch(error => sendResponse(STUDIESYNC_ERRORS.toStatus(error)));
    return true;
  }
  // Skift til en anden Google-konto
  if (message?.type === "STUDIESYNC_SWITCH_ACCOUNT") {
    switchGoogleAccount().then(() => sendResponse({ ok: true })).catch(error => sendResponse(STUDIESYNC_ERRORS.toStatus(error)));
    return true;
  }
  // Indstillinger er ændret i popup'en: opdatér alarmen og kalendernavnet
  if (message?.type === "STUDIESYNC_TASKS_ENABLE") {
    enableTasks().then(sendResponse).catch(error => sendResponse(STUDIESYNC_ERRORS.toStatus(error)));
    return true;
  }
  if (message?.type === "STUDIESYNC_SETTINGS_CHANGED") {
    applyReminderSettings().catch(() => {}); // kører videre i baggrunden, så "Gemt" ikke venter på Google
    Promise.all([applyAlarm(), renameCalendar()]).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});
