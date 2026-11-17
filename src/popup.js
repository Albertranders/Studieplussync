// Popupens dashboard, introduktionsguide, menu og indstillinger.
import { INTERVAL_CHOICES, THEME_CHOICES, WEEK_CHOICES, autoSyncText, resolveSettings, timeZoneOptions } from "./settings.js";

const CONFIG = globalThis.STUDIESYNC_CONFIG;
const $ = id => document.getElementById(id);
const viewMain = $("view-main"), viewSettings = $("view-settings"), viewGuide = $("view-guide");
const state = $("state"), detail = $("detail"), dot = $("dot"), updated = $("last-sync-value");
const syncButton = $("sync"), connectButton = $("connect");
const menu = $("menu"), menuButton = $("menu-button"), historyPanel = $("history-panel");

function message(type) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type }, response => resolve(response)));
}
function setStatus(status) {
  if (!status) return;
  state.textContent = status.message || "Klar til synkronisering";
  detail.textContent = status.detail || (status.ok ? "Forbindelsen fungerer." : "Kontrollér Studie+ og prøv igen.");
  dot.className = "dot " + (status.ok ? "good" : "bad");
}
function setBusy(title, text) {
  state.textContent = title; detail.textContent = text; dot.className = "dot";
}
function showView(name) {
  viewMain.hidden = name !== "main";
  viewSettings.hidden = name !== "settings";
  viewGuide.hidden = name !== "guide";
}
function openMenu(open) {
  menu.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
}
menuButton.addEventListener("click", event => { event.stopPropagation(); openMenu(menu.hidden); });
document.addEventListener("click", event => { if (!menu.contains(event.target) && event.target !== menuButton) openMenu(false); });
document.addEventListener("keydown", event => { if (event.key === "Escape") openMenu(false); });

async function refreshAuth() {
  const auth = await message("STUDIESYNC_AUTH_STATE");
  const connected = Boolean(auth?.connected);
  connectButton.hidden = connected;
  syncButton.hidden = !connected;
  $("menu-account").hidden = !connected;
  $("menu-email").textContent = auth?.email ? `Forbundet som ${auth.email}` : "Google-konto forbundet";
  $("connection-value").textContent = connected ? "Google forbundet" : "Ikke forbundet";
  $("connection-detail").textContent = connected ? (auth?.email || "Google Kalender er klar") : "Forbind Google Kalender for at starte";
  return connected;
}
function showNotConnected() { setBusy("Google Kalender er ikke forbundet", "Forbind din Google-konto for at komme i gang."); }

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("da-DK", { weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" });
}
function renderNextLesson(lesson) {
  $("next-subject").textContent = lesson?.summary || "Ingen kommende lektion";
  $("next-time").textContent = lesson ? formatDateTime(lesson.start) : "Synkronisér for at hente dit skema.";
  $("next-meta").textContent = lesson?.location ? `Lokale: ${lesson.location}` : "";
  $("next-badge").textContent = lesson ? "I kalenderen" : "Afventer";
}
async function refreshDashboard() {
  const status = await message("STUDIESYNC_STATUS");
  if (status?.lastStatus) setStatus(status.lastStatus);
  if (status?.lastUpdated) {
    const date = formatDateTime(status.lastUpdated);
    updated.textContent = date || "Ukendt tidspunkt";
    $("last-sync-detail").textContent = status.lastStatus?.ok ? "Seneste synkronisering gennemført" : "Seneste forsøg";
  } else {
    updated.textContent = "Aldrig";
    $("last-sync-detail").textContent = "Ingen synkronisering endnu";
  }
  const data = await message("STUDIESYNC_DASHBOARD");
  renderNextLesson(data?.nextLesson);
}
async function renderHistory() {
  const list = $("history-list");
  list.replaceChildren();
  const history = await message("STUDIESYNC_HISTORY");
  if (!Array.isArray(history) || !history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty"; empty.textContent = "Der er endnu ingen synkroniseringer.";
    list.append(empty); return;
  }
  for (const item of history) {
    const row = document.createElement("article"); row.className = "history-item";
    const heading = document.createElement("div"); heading.className = "history-heading";
    const result = document.createElement("strong");
    result.textContent = item.ok ? "Gennemført" : "Fejlede";
    result.className = item.ok ? "history-good" : "history-bad";
    const date = document.createElement("time"); date.dateTime = item.at;
    date.textContent = formatDateTime(item.at) || "Ukendt tidspunkt";
    heading.append(result, date);
    const description = document.createElement("p"); description.textContent = item.message || "";
    const meta = document.createElement("small");
    meta.textContent = item.trigger === "automatic" ? "Automatisk" : "Manuel";
    if (item.code) meta.textContent += " · " + item.code;
    if (item.counts) {
      const c = item.counts;
      meta.textContent += ` · ${c.created} nye, ${c.updated} ændrede, ${c.deleted} slettede`;
    }
    row.append(heading, description, meta); list.append(row);
  }
}

$("menu-dashboard").addEventListener("click", () => { openMenu(false); showView("main"); });
$("menu-settings").addEventListener("click", () => { openMenu(false); showView("settings"); });
$("menu-guide").addEventListener("click", () => { openMenu(false); openGuide(); });
$("history-toggle").addEventListener("click", async () => {
  const opening = historyPanel.hidden;
  historyPanel.hidden = !opening;
  $("history-toggle").setAttribute("aria-expanded", String(opening));
  if (opening) await renderHistory();
});
$("menu-test").addEventListener("click", async () => {
  openMenu(false); showView("main");
  setBusy("Tester Studie+…", "Kontrollerer den aktive session og skemaforbindelsen.");
  setStatus(await message("STUDIESYNC_TEST_CONNECTION"));
  await refreshDashboard();
});
$("menu-switch").addEventListener("click", async () => {
  openMenu(false); showView("main");
  setBusy("Skifter Google-konto…", "Vælg konto i vinduet, der åbner.");
  const result = await message("STUDIESYNC_SWITCH_ACCOUNT");
  await refreshAuth(); setStatus(result?.ok ? {ok:true,message:"Google-konto er skiftet."} : result);
  await refreshDashboard();
});
$("menu-logout").addEventListener("click", async () => {
  openMenu(false); showView("main"); setBusy("Logger ud…", "Et øjeblik.");
  const result = await message("STUDIESYNC_LOGOUT");
  const connected = await refreshAuth();
  if (!result?.ok) setStatus(result);
  else if (!connected) { showNotConnected(); updated.textContent = "Aldrig"; }
});

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  const result = await message("STUDIESYNC_CONNECT");
  connectButton.disabled = false;
  await refreshAuth();
  setStatus(result?.ok ? {ok:true,message:"Google Kalender er forbundet."} : result);
  await refreshDashboard();
});
syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  setBusy("Synkroniserer…", "Henter skema og opdaterer kalenderen.");
  const result = await message("STUDIESYNC_SYNC");
  syncButton.disabled = false;
  if (result?.busy) setBusy(result.message, result.detail);
  else setStatus(result);
  await refreshDashboard();
  if (!historyPanel.hidden) await renderHistory();
});

// Introduktionsguide
const guideSteps = [
  { icon:"1", title:"Åbn Studie+", body:"Åbn all.studieplus.dk eller all.uddataplus.dk i din browser. Log ind, og lad fanen være åben. StudieSync læser skemaet fra din aktive Studie+-session.", tip:"Du skal ikke indtaste din Studie+-adgangskode i StudieSync." },
  { icon:"2", title:"Forbind Google Kalender", body:"Åbn StudieSync fra browserens udvidelsesikon, og tryk på Forbind Google Kalender. Log ind med den Gmail-konto, der er godkendt til at bruge udvidelsen, og giv adgang til den kalender, StudieSync opretter.", tip:"Hvis Google viser en advarsel om, at appen ikke er verificeret, skal du følge projektets adgangsvejledning." },
  { icon:"3", title:"Kør første synkronisering", body:"Tryk på Synkronisér nu. StudieSync henter dine lektioner og opretter en separat kalender i Google Kalender. Du kan se resultatet og tidspunktet på dashboardet.", tip:"Studie+-fanen skal være åben og logget ind, når der synkroniseres." },
  { icon:"4", title:"Tilpas indstillingerne", body:"I menuen kan du vælge antal uger, automatisk synkronisering, tidszone, kalendernavn og farvetema. Automatisk synkronisering kører, mens browseren er åben.", tip:"Du kan altid åbne denne guide igen fra menuen. Brug Test Studie+ forbindelsen ved problemer." }
];
let guideIndex = 0;
function renderGuide() {
  const step = guideSteps[guideIndex];
  $("guide-step-count").textContent = `${guideIndex+1} / ${guideSteps.length}`;
  $("guide-kicker").textContent = `TRIN ${guideIndex+1} AF ${guideSteps.length}`;
  $("guide-icon").textContent = step.icon;
  $("guide-title").textContent = step.title;
  $("guide-body").textContent = step.body;
  $("guide-tip").textContent = step.tip;
  $("guide-progress-fill").style.width = `${(guideIndex+1)/guideSteps.length*100}%`;
  $("guide-back").disabled = guideIndex === 0;
  $("guide-next").textContent = guideIndex === guideSteps.length-1 ? "Afslut" : "Næste";
}
function openGuide() { guideIndex = 0; renderGuide(); showView("guide"); }
async function finishGuide() {
  await chrome.storage.local.set({ guideCompleted: true });
  showView("main");
}
$("guide-start").addEventListener("click", openGuide);
$("guide-close").addEventListener("click", () => showView("main"));
$("guide-skip").addEventListener("click", finishGuide);
$("guide-back").addEventListener("click", () => { if (guideIndex > 0) guideIndex--; renderGuide(); });
$("guide-next").addEventListener("click", async () => {
  if (guideIndex < guideSteps.length-1) { guideIndex++; renderGuide(); }
  else await finishGuide();
});

// Indstillinger
function fillSelect(select, values, label) {
  select.replaceChildren();
  for (const value of values) select.add(new Option(label(value), String(value)));
}
const weekLabel = n => n === 1 ? "1 uge" : `${n} uger`;
const minutesLabel = m => m < 60 ? `${m} min.` : m % 60 === 0 ? (m === 60 ? "1 time" : `${m/60} timer`) : `${m} min.`;
function fillChoices(settings) {
  const maxWeeks = Math.max(1, Number(CONFIG.maxWeeks) || 12);
  const weeks = [...new Set([...WEEK_CHOICES.filter(n => n <= maxWeeks), settings.scheduleWeeks])].sort((a,b)=>a-b);
  const minutes = [...new Set([...INTERVAL_CHOICES, settings.autoSyncMinutes])].sort((a,b)=>a-b);
  fillSelect($("weeks"), weeks, weekLabel); fillSelect($("interval"), minutes, minutesLabel);
}
function fillTimeZones(selected) {
  const select = $("timeZone");
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [selected];
  if (!zones.includes("UTC")) zones.push("UTC");
  if (!zones.includes(selected)) zones.push(selected);
  select.replaceChildren();
  for (const [id,label] of timeZoneOptions(zones)) select.add(new Option(label,id));
  select.value = selected;
}
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
function showSettings(settings) {
  fillChoices(settings);
  $("weeks").value = String(settings.scheduleWeeks);
  $("autoSync").checked = settings.autoSync;
  $("interval").value = String(settings.autoSyncMinutes);
  $("interval").disabled = !settings.autoSync;
  $("interval-row").classList.toggle("disabled", !settings.autoSync);
  $("calendarName").value = settings.calendarName;
  fillTimeZones(settings.timeZone);
  fillSelect($("theme"), THEME_CHOICES.map(([id])=>id), id=>THEME_CHOICES.find(([key])=>key===id)[1]);
  $("theme").value = settings.theme; applyTheme(settings.theme);
  $("autosync").textContent = autoSyncText(settings);
}
async function loadSettings() {
  return resolveSettings(await chrome.storage.local.get(["scheduleWeeks","autoSync","autoSyncMinutes","calendarName","timeZone","theme"]), CONFIG);
}
let savedTimer;
function flashSaved(text) {
  $("saved").textContent = text;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $("saved").textContent = ""; }, 1500);
}
async function saveSettings() {
  const settings = resolveSettings({
    scheduleWeeks:$("weeks").value, autoSync:$("autoSync").checked,
    autoSyncMinutes:$("interval").value, calendarName:$("calendarName").value,
    timeZone:$("timeZone").value, theme:$("theme").value
  }, CONFIG);
  await chrome.storage.local.set(settings);
  showSettings(settings); flashSaved("Gemt ✓");
  await message("STUDIESYNC_SETTINGS_CHANGED");
}
for (const id of ["weeks","autoSync","interval","calendarName","timeZone","theme"]) $(id).addEventListener("change", saveSettings);
$("reset").addEventListener("click", async () => {
  await chrome.storage.local.remove(["scheduleWeeks","autoSync","autoSyncMinutes","calendarName","timeZone","theme"]);
  showSettings(await loadSettings()); flashSaved("Nulstillet ✓");
  await message("STUDIESYNC_SETTINGS_CHANGED");
});
$("back").addEventListener("click", () => showView("main"));

async function load() {
  showSettings(await loadSettings());
  const manifest = chrome.runtime.getManifest();
  $("version").textContent = `v${manifest.version}`;
  const connected = await refreshAuth();
  if (!connected) showNotConnected();
  await refreshDashboard();
  const { guideCompleted } = await chrome.storage.local.get(["guideCompleted"]);
  if (!guideCompleted) openGuide();
}
load().catch(error => {
  setBusy("Dashboard kunne ikke indlæses", error?.message || "Genindlæs udvidelsen, og prøv igen.");
});
