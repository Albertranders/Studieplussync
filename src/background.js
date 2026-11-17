// Service worker: styrer Google-login, kalenderkald og selve synkroniseringen.
import { buildPlan, contentHash, eventBody, isSafeSchedule, isSuspiciousDrop, MANAGED_HASH, MANAGED_KEY } from "./sync.js";
import "./config.js";   // opsætning (se config.js)
import "./errors.js";   // fejlkoder (se errors.js)
import { buildAuthUrl, isConnected, isTokenFresh, parseAuthRedirect, REVOKE_URL, USERINFO_URL, withTokenRetry } from "./auth.js";
import { resolveSettings } from "./settings.js";
import { appendHistory, createHistoryEntry } from "./history.js";
import { createSyncLock } from "./sync-lock.js";
import { addPartialProgressToStatus, createSyncProgress } from "./sync-progress.js";

// Client ID (fra config.js). Skal være en OAuth-klient af typen "Web application", og
// redirect-URI'en fra `chrome.identity.getRedirectURL()` skal være tilføjet i Google Cloud Console.
const CONFIG = globalThis.STUDIESYNC_CONFIG;   // alle indstillinger ligger i config.js
const CLIENT_ID = CONFIG.googleClientId;

const ALARM_NAME = "studiesync-auto-sync";
const syncLock = createSyncLock();   // navnet på den tilbagevendende alarm

// Indstillinger: standardværdierne fra config.js, med det brugeren har valgt i menuen "Indstillinger" ovenpå
async function getSettings() {
  return resolveSettings(
    await storageGet(["scheduleWeeks", "autoSync", "autoSyncMinutes", "calendarName", "timeZone"]),
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
  const { loginHint } = await storageGet(["loginHint"]);
  const state = crypto.randomUUID();
  const url = buildAuthUrl({
    clientId: CLIENT_ID,
    redirectUri: chrome.identity.getRedirectURL(),
    state,
    interactive,
    loginHint,
    selectAccount
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
const MAX_TRIES = CONFIG.maxTries;          // maks. antal forsøg pr. kald

// Er svaret en "du kalder for hurtigt"-fejl fra Google?
function isRateLimited(status, body) {
  return status === 429 || (status === 403 && /rate\s*limit|quota/i.test(body));
}

// Vælger fejlkode ud fra Googles svar
function googleErrorCode(status, body) {
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
    const response = await fetch(calendarUrl(path), {
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
      const failure = new StudySyncError(googleErrorCode(response.status, body), `Google Kalender (${response.status}): ${body.slice(0, 300)}`);
      failure.status = response.status;
      throw failure;
    }
    // Vent så længe Google beder om, ellers eksponentiel ventetid (maks. 30 sek.) + lidt tilfældighed
    const retryAfter = Number(response.headers.get("Retry-After"));
    const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30000);
    await sleep(wait + Math.random() * 500);
  }
}

// --- Kalender og events ---

// Finder id'et på vores kalender (gemt fra sidst) eller opretter den.
// Den gemte kalender tjekkes, for den kan være slettet, eller være oprettet af en anden
// OAuth-klient (fx Chrome vs. Opera), som scopet calendar.app.created ikke kan se (404).
async function ensureCalendar(token) {
  const { calendarId } = await storageGet(["calendarId"]);
  if (calendarId) {
    try {
      await googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}`);
      return calendarId;
    } catch (error) {
      if (error.status !== 404 && error.status !== 410) throw error;
      await storageSet({ calendarId: null }); // findes ikke mere: opret en ny nedenfor
    }
  }
  const created = await googleRequest(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: (await getSettings()).calendarName, timeZone: (await getSettings()).timeZone })
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

// Henter næste kommende lektion fra den kalender, StudieSync selv administrerer.
async function dashboardData() {
  const { calendarId } = await storageGet(["calendarId"]);
  if (!calendarId) return { nextLesson: null };
  const result = await withTokenRetry(() => googleToken(false), token => {
    const now = new Date();
    const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      singleEvents: "true", showDeleted: "false", orderBy: "startTime",
      maxResults: "1", timeMin: now.toISOString(), timeMax: until.toISOString()
    });
    return googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  });
  const event = result.items?.[0];
  if (!event) return { nextLesson: null };
  return { nextLesson: {
    summary: event.summary || "Lektion",
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    location: event.location || ""
  } };
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
function sendTabMessage(tab, type, weeks) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type, weeks }, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new StudySyncError("E302", error.message));
      else if (!response?.ok) reject(response?.error ? new Error(response.error) : new StudySyncError("E302", "Tomt svar fra Studie+-siden."));
      else resolve(response);
    });
  });
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

// Mandag kl. 00:00 i ugen for den givne dato (bruges ikke i øjeblikket)
function mondayStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// --- Selve synkroniseringen ---

// Udfører planen mod Google: opret, opdater og slet – med pauser mellem hvert kald
async function applyPlan(token, calendarId, plan, timeZone, progress) {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  for (const item of plan.create) {
    const body = eventBody(item.lesson, timeZone);
    // Tilføj de skjulte felter, så vi kan genkende eventet næste gang
    body.extendedProperties = { private: { [MANAGED_KEY]: item.key, [MANAGED_HASH]: contentHash(item.lesson, timeZone) } };
    await googleRequest(token, base, { method: "POST", body: JSON.stringify(body) });
    progress.record("created");
    await sleep(WRITE_DELAY_MS);
  }
  for (const item of plan.update) {
    const body = eventBody(item.lesson, timeZone);
    body.extendedProperties = { private: { [MANAGED_KEY]: item.key, [MANAGED_HASH]: contentHash(item.lesson, timeZone) } };
    await googleRequest(token, `${base}/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify(body) });
    progress.record("updated");
    await sleep(WRITE_DELAY_MS);
  }
  for (const id of plan.delete) {
    await googleRequest(token, `${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    progress.record("deleted");
    await sleep(WRITE_DELAY_MS);
  }
}

// Hele flowet: hent skema -> valider -> sammenlign med kalenderen -> udfør ændringer.
// `interactive` = må der vises Google-login, hvis token mangler? (false ved automatisk kørsel)
async function performSyncNow(interactive = false, trigger = "manual") {
  const progress = createSyncProgress();
  try {
    const tab = await findStudyPlusTab();
    if (!tab) throw new StudySyncError("E301");
    const result = await readSchedule(tab);
    const lessons = result.lessons;
    // Går noget galt her, stopper vi, før kalenderen røres
    if (!isSafeSchedule(lessons)) throw new StudySyncError("E501", "Skemaet kunne ikke valideres. Kalenderen er ikke ændret.");

    // Afviser Google tokenet (401), ryddes det i googleRequest, og hele Google-delen prøves én gang
    // til med et nyt token (stille fornyelse først). Planen beregnes forfra, så et genforsøg er sikkert.
    const plan = await withTokenRetry(() => googleToken(interactive), async token => {
      const calendarId = await ensureCalendar(token);
      // Find tidsrummet skemaet dækker (første til sidste dato, inkl. sidste dag)
      const dates = lessons.map(lesson => lesson.date).sort();
      const start = new Date(`${dates[0]}T00:00:00`);
      const end = new Date(`${dates[dates.length - 1]}T00:00:00`);
      end.setDate(end.getDate() + 1);
      const existing = await getManagedEvents(token, calendarId, start, end);
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
    await recordSyncHistory(status, trigger);
    await sendStatus(status);
    return status;
  } catch (error) {
    const status = addPartialProgressToStatus(STUDIESYNC_ERRORS.toStatus(error), progress.snapshot());
    if (error && typeof error === "object") error.syncStatus = status;
    await recordSyncHistory(status, trigger);
    await sendStatus(status);
    throw error;
  }
}

// Sørger for, at alarm og manuelle klik aldrig udfører samme synkronisering samtidigt.
async function syncNow(interactive = false, trigger = "manual") {
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
    return await performSyncNow(interactive, trigger);
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
// Når alarmen udløses: synkronisér i baggrunden (uden login-vindue, fejl ignoreres)
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) syncNow(false, "automatic").catch(() => {});
});
// Beskeder fra popup'en. `return true` betyder, at svaret sendes asynkront
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Hent seneste status til visning i popup'en
  if (message?.type === "STUDIESYNC_STATUS") {
    storageGet(["lastStatus", "lastUpdated", "calendarId"]).then(sendResponse);
    return true;
  }
  // Hent næste lektion til dashboardet
  if (message?.type === "STUDIESYNC_DASHBOARD") {
    dashboardData().then(sendResponse).catch(() => sendResponse({ nextLesson: null }));
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
  if (message?.type === "STUDIESYNC_SETTINGS_CHANGED") {
    Promise.all([applyAlarm(), renameCalendar()]).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});
