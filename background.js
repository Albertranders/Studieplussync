// Service worker: styrer Google-login, kalenderkald og selve synkroniseringen.
import { buildPlan, contentHash, eventBody, isSafeSchedule, isSuspiciousDrop, MANAGED_HASH, MANAGED_KEY, TIME_ZONE } from "./sync.js";
import { buildAuthUrl, isTokenFresh, needsWebAuthFlow, parseAuthRedirect } from "./auth.js";

// Client ID til Opera/Edge. Skal være en OAuth-klient af typen "Web application", og
// redirect-URI'en fra `chrome.identity.getRedirectURL()` skal være tilføjet i Google Cloud Console.
// Chrome bruger i stedet `oauth2.client_id` fra manifest.json.
const WEB_CLIENT_ID = "INSERT WEB CLIENT ID HERE";

const CALENDAR_NAME = "Studie+ skema";       // navnet på den kalender vi opretter
const ALARM_NAME = "studiesync-auto-sync";   // navnet på den tilbagevendende alarm

// --- Små hjælpere til lagring og status ---

// Læser værdier fra udvidelsens lokale lager
function storageGet(keys) {
  return chrome.storage.local.get(keys);
}
// Gemmer værdier i udvidelsens lokale lager
function storageSet(values) {
  return chrome.storage.local.set(values);
}
// Gemmer seneste status (vises i popup'en) sammen med et tidsstempel
function sendStatus(status) {
  return storageSet({ lastStatus: status, lastUpdated: new Date().toISOString() });
}
// Bygger fuld URL til Google Calendar API
function calendarUrl(path) {
  return `https://www.googleapis.com/calendar/v3${path}`;
}

// --- Google-login ---

// Henter et OAuth-token. `interactive` = må der vises et login-vindue?
// Chrome bruger sit eget login; Opera og Edge bruger et almindeligt OAuth-vindue.
async function googleToken(interactive) {
  if (needsWebAuthFlow(navigator.userAgent)) return webAuthFlowToken(interactive);
  return chromeToken(interactive);
}

// Login via `launchWebAuthFlow` (virker i alle Chromium-browsere). Token gemmes, til det udløber.
async function webAuthFlowToken(interactive) {
  const { webToken } = await storageGet(["webToken"]);
  if (isTokenFresh(webToken)) return webToken.token;
  if (WEB_CLIENT_ID.startsWith("INSERT")) {
    throw new Error("Mangler Web-Client ID til Opera/Edge. Se README.");
  }
  const state = crypto.randomUUID();
  const url = buildAuthUrl({
    clientId: WEB_CLIENT_ID,
    redirectUri: chrome.identity.getRedirectURL(),
    state,
    interactive
  });
  let redirectUrl;
  try {
    redirectUrl = await chrome.identity.launchWebAuthFlow({ url, interactive });
  } catch (error) {
    throw new Error(error?.message || "Google-login mislykkedes.");
  }
  const fresh = parseAuthRedirect(redirectUrl, state);
  await storageSet({ webToken: fresh });
  return fresh.token;
}

// Login via Chromes indbyggede `getAuthToken` (kun Google Chrome)
async function chromeToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      const error = chrome.runtime.lastError;
      if (error || !token) reject(new Error(error?.message || "Google-login mislykkedes."));
      else resolve(token);
    });
  });
}

// --- Kald til Google Calendar med automatisk genforsøg ---

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const WRITE_DELAY_MS = 300;   // pause mellem skrivninger, så Google ikke rate-limiter
const MAX_TRIES = 6;          // maks. antal forsøg pr. kald

// Er svaret en "du kalder for hurtigt"-fejl fra Google?
function isRateLimited(status, body) {
  return status === 429 || (status === 403 && /rate\s*limit|quota/i.test(body));
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
    const retryable = isRateLimited(response.status, body) || response.status >= 500;
    // Giv op hvis fejlen ikke kan genforsøges, eller vi har brugt alle forsøg
    if (!retryable || attempt >= MAX_TRIES) {
      throw new Error(`Google Kalender (${response.status}): ${body.slice(0, 300)}`);
    }
    // Vent så længe Google beder om, ellers eksponentiel ventetid (maks. 30 sek.) + lidt tilfældighed
    const retryAfter = Number(response.headers.get("Retry-After"));
    const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30000);
    await sleep(wait + Math.random() * 500);
  }
}

// --- Kalender og events ---

// Finder id'et på vores kalender (gemt fra sidst) eller opretter den første gang
async function ensureCalendar(token) {
  const { calendarId } = await storageGet(["calendarId"]);
  if (calendarId) return calendarId;
  const created = await googleRequest(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: CALENDAR_NAME, timeZone: TIME_ZONE })
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

// --- Kommunikation med Studie+-fanen ---

// Finder en åben, ikke-sovende Studie+-fane (content-scriptet kører dér)
async function findStudyPlusTab() {
  const tabs = await chrome.tabs.query({ url: "https://all.uddataplus.dk/*" });
  return tabs.find(tab => tab.id != null && !tab.discarded) || null;
}

// Antal uger der skal hentes (valgt i popup'en), begrænset til 1-12, standard 4
async function scheduleWeeks() {
  const { scheduleWeeks = 4 } = await storageGet(["scheduleWeeks"]);
  return Math.max(1, Math.min(12, Number(scheduleWeeks) || 4));
}

// Sender en besked til content-scriptet i fanen og venter på svar
function sendTabMessage(tab, type, weeks) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type, weeks }, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error("Åbn Studie+ skemaet, og genindlæs siden. " + error.message));
      else if (!response?.ok) reject(new Error(response?.error || "Kunne ikke læse Studie+ svaret."));
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
    if (!tab) throw new Error("Åbn Studie+ skemaet i Chrome, og log ind først.");
    const result = await sendTabMessage(tab, "STUDIESYNC_TEST_CONNECTION", await scheduleWeeks());
    const status = {
      ok: true,
      message: "Forbindelsen til Studie+ virker.",
      detail: `Session godkendt. ${result.lessonCount} lektioner fundet for ${result.dateRange.start} til ${result.dateRange.end}.`
    };
    await sendStatus(status);
    return status;
  } catch (error) {
    const status = { ok: false, message: "Studie+ testen mislykkedes.", detail: error?.message || String(error) };
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
async function applyPlan(token, calendarId, plan) {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  for (const item of plan.create) {
    const body = eventBody(item.lesson);
    // Tilføj de skjulte felter, så vi kan genkende eventet næste gang
    body.extendedProperties = { private: { [MANAGED_KEY]: item.key, [MANAGED_HASH]: contentHash(item.lesson) } };
    await googleRequest(token, base, { method: "POST", body: JSON.stringify(body) });
    await sleep(WRITE_DELAY_MS);
  }
  for (const item of plan.update) {
    const body = eventBody(item.lesson);
    body.extendedProperties = { private: { [MANAGED_KEY]: item.key, [MANAGED_HASH]: contentHash(item.lesson) } };
    await googleRequest(token, `${base}/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify(body) });
    await sleep(WRITE_DELAY_MS);
  }
  for (const id of plan.delete) {
    await googleRequest(token, `${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    await sleep(WRITE_DELAY_MS);
  }
}

// Hele flowet: hent skema -> valider -> sammenlign med kalenderen -> udfør ændringer.
// `interactive` = må der vises Google-login, hvis token mangler? (false ved automatisk kørsel)
async function syncNow(interactive = false) {
  try {
    const tab = await findStudyPlusTab();
    if (!tab) throw new Error("Åbn Studie+ i Chrome og log ind først.");
    const result = await readSchedule(tab);
    const lessons = result.lessons;
    // Går noget galt her, stopper vi, før kalenderen røres
    if (!isSafeSchedule(lessons)) throw new Error("Skemaet kunne ikke valideres. Kalenderen er ikke ændret.");

    const token = await googleToken(interactive);
    const calendarId = await ensureCalendar(token);
    // Find tidsrummet skemaet dækker (første til sidste dato, inkl. sidste dag)
    const dates = lessons.map(lesson => lesson.date).sort();
    const start = new Date(`${dates[0]}T00:00:00`);
    const end = new Date(`${dates[dates.length - 1]}T00:00:00`);
    end.setDate(end.getDate() + 1);
    const existing = await getManagedEvents(token, calendarId, start, end);
    // Beskyt mod en delvis hentning, der ellers ville slette mange events
    if (isSuspiciousDrop(existing.length, lessons.length)) {
      throw new Error("Studie+ viste markant færre lektioner end kalenderen for de samme datoer. For at beskytte dine kalenderdata blev synkroniseringen stoppet.");
    }
    const plan = buildPlan(lessons, existing);
    await applyPlan(token, calendarId, plan);
    const status = {
      ok: true,
      message: `Synkroniseret: ${plan.create.length} nye, ${plan.update.length} ændrede, ${plan.delete.length} slettede, ${plan.unchanged} uændrede.`,
      counts: { lessons: lessons.length, created: plan.create.length, updated: plan.update.length, deleted: plan.delete.length, unchanged: plan.unchanged },
      pageTitle: result.pageTitle
    };
    await sendStatus(status);
    return status;
  } catch (error) {
    // Gem fejlen som status (så popup'en kan vise den) og kast den videre
    const status = { ok: false, message: error?.message || String(error) };
    await sendStatus(status);
    throw error;
  }
}

// --- Hændelser ---

// Ved installation: opret en alarm, der udløses hvert 30. minut
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 30 });
});
// Når alarmen udløses: synkronisér i baggrunden (uden login-vindue, fejl ignoreres)
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) syncNow(false).catch(() => {});
});
// Beskeder fra popup'en. `return true` betyder, at svaret sendes asynkront
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Hent seneste status til visning i popup'en
  if (message?.type === "STUDIESYNC_STATUS") {
    storageGet(["lastStatus", "lastUpdated", "calendarId"]).then(sendResponse);
    return true;
  }
  // Test forbindelsen til Studie+
  if (message?.type === "STUDIESYNC_TEST_CONNECTION") {
    testConnection().then(sendResponse);
    return true;
  }
  // Synkronisér nu (med mulighed for Google-login)
  if (message?.type === "STUDIESYNC_SYNC") {
    syncNow(true).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  // Forbind Google Kalender (viser login-vindue hvis nødvendigt)
  if (message?.type === "STUDIESYNC_CONNECT") {
    googleToken(true).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
});
