import { buildPlan, contentHash, eventBody, isSafeSchedule, MANAGED_HASH, MANAGED_KEY, TIME_ZONE } from "./sync.js";

const CALENDAR_NAME = "Studie+ skema";
const ALARM_NAME = "studiesync-auto-sync";
const WEEKS_AHEAD = 8;

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}
function storageSet(values) {
  return chrome.storage.local.set(values);
}
function sendStatus(status) {
  return storageSet({ lastStatus: status, lastUpdated: new Date().toISOString() });
}
function calendarUrl(path) {
  return `https://www.googleapis.com/calendar/v3${path}`;
}
async function googleToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      const error = chrome.runtime.lastError;
      if (error || !token) reject(new Error(error?.message || "Google-login mislykkedes."));
      else resolve(token);
    });
  });
}
async function googleRequest(token, path, options = {}) {
  const response = await fetch(calendarUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Kalender (${response.status}): ${body.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}
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
async function getManagedEvents(token, calendarId, timeMin, timeMax) {
  const events = [];
  let pageToken = "";
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
  return events.filter(event => event.extendedProperties?.private?.[MANAGED_KEY]);
}
async function findStudyPlusTab() {
  const tabs = await chrome.tabs.query({ url: "https://all.studieplus.dk/*" });
  return tabs.find(tab => tab.id != null && !tab.discarded) || null;
}
async function readSchedule(tab) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type: "STUDIESYNC_READ_SCHEDULE" }, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error("Åbn Studie+ skemaet, og genindlæs siden. " + error.message));
      else if (!response?.ok) reject(new Error(response?.error || "Kunne ikke læse skemaet."));
      else resolve(response);
    });
  });
}
function mondayStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
async function applyPlan(token, calendarId, plan) {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  for (const item of plan.create) {
    const body = eventBody(item.lesson);
    body.extendedProperties = { private: { [MANAGED_KEY]: item.key, [MANAGED_HASH]: contentHash(item.lesson) } };
    await googleRequest(token, base, { method: "POST", body: JSON.stringify(body) });
  }
  for (const item of plan.update) {
    const body = eventBody(item.lesson);
    body.extendedProperties = { private: { [MANAGED_KEY]: item.key, [MANAGED_HASH]: contentHash(item.lesson) } };
    await googleRequest(token, `${base}/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify(body) });
  }
  for (const id of plan.delete) {
    await googleRequest(token, `${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}
async function syncNow(interactive = false) {
  try {
    const tab = await findStudyPlusTab();
    if (!tab) throw new Error("Åbn Studie+ i Chrome og log ind først.");
    const result = await readSchedule(tab);
    const lessons = result.lessons;
    if (!isSafeSchedule(lessons)) throw new Error("Skemaet kunne ikke valideres. Kalenderen er ikke ændret.");

    const token = await googleToken(interactive);
    const calendarId = await ensureCalendar(token);
    const start = mondayStart();
    const end = new Date(start);
    end.setDate(end.getDate() + WEEKS_AHEAD * 7);
    const existing = await getManagedEvents(token, calendarId, start, end);
    const plan = buildPlan(lessons, existing);

    // Never interpret an empty or malformed scrape as a request to delete calendar events.
    if (!lessons.length) throw new Error("Studie+ returnerede ingen lektioner. Ingen kalenderændringer foretaget.");

    await applyPlan(token, calendarId, plan);
    const status = {
      ok: true,
      message: `Synkroniseret: ${plan.create.length} nye, ${plan.update.length} ændrede, ${plan.delete.length} slettede, ${plan.unchanged} uændrede.`,
      counts: { lessons: lessons.length, ...{ created: plan.create.length, updated: plan.update.length, deleted: plan.delete.length, unchanged: plan.unchanged } },
      pageTitle: result.pageTitle
    };
    await sendStatus(status);
    return status;
  } catch (error) {
    const status = { ok: false, message: error?.message || String(error) };
    await sendStatus(status);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 30 });
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) syncNow(false).catch(() => {});
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "STUDIESYNC_STATUS") {
    storageGet(["lastStatus", "lastUpdated", "calendarId"]).then(sendResponse);
    return true;
  }
  if (message?.type === "STUDIESYNC_SYNC") {
    syncNow(true).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === "STUDIESYNC_CONNECT") {
    googleToken(true).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
});
