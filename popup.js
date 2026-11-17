// Popup'ens logik: hovedvisning, menu og indstillinger.
import { INTERVAL_CHOICES, THEME_CHOICES, WEEK_CHOICES, autoSyncText, resolveSettings, timeZoneOptions } from "./settings.js";

const CONFIG = globalThis.STUDIESYNC_CONFIG;   // standardværdier fra config.js
const $ = id => document.getElementById(id);

const viewMain = $("view-main"), viewSettings = $("view-settings");
const state = $("state"), detail = $("detail"), dot = $("dot"), updated = $("updated");
const syncButton = $("sync"), connectButton = $("connect");
const menu = $("menu"), menuButton = $("menu-button");

// Sender en besked til baggrundsscriptet (background.js) og venter på svaret
function message(type) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type }, resolve));
}

// Viser en status i popup'en (tekst + grøn/rød prik)
function setStatus(status) {
  if (!status) return;
  state.textContent = status.message || "Klar til synkronisering";
  detail.textContent = status.detail || (status.ok ? "Forbindelsen fungerer." : "Kontrollér Studie+ og prøv igen.");
  dot.className = "dot " + (status.ok ? "good" : "bad");
}

// Viser et "arbejder"-trin uden farve
function setBusy(title, text) {
  state.textContent = title;
  detail.textContent = text;
  dot.className = "dot";
}

function showView(name) {
  viewMain.hidden = name !== "main";
  viewSettings.hidden = name !== "settings";
}

// --- Google-konto: hovedknap og kontopunkter i menuen ---

// "Forbind" i midten, indtil en konto er forbundet. Så rykker kontohandlingerne op i menuen.
async function refreshAuth() {
  const auth = await message("STUDIESYNC_AUTH_STATE");
  const connected = Boolean(auth?.connected);
  connectButton.hidden = connected;
  syncButton.hidden = !connected;
  $("menu-account").hidden = !connected;
  $("menu-email").textContent = auth?.email ? `Forbundet som ${auth.email}` : "Google-konto forbundet";
  return connected;
}

function showNotConnected() {
  setBusy("Google Kalender er ikke forbundet", "Forbind din Google-konto for at komme i gang.");
}

// --- Menu ---

function openMenu(open) {
  menu.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
}
menuButton.addEventListener("click", event => { event.stopPropagation(); openMenu(menu.hidden); });
document.addEventListener("click", event => { if (!menu.contains(event.target)) openMenu(false); });
document.addEventListener("keydown", event => { if (event.key === "Escape") openMenu(false); });

$("menu-settings").addEventListener("click", () => { openMenu(false); showView("settings"); });

$("menu-test").addEventListener("click", async () => {
  openMenu(false);
  showView("main");
  setBusy("Tester Studie+…", "Kontrollerer den aktive session og skemaforbindelsen.");
  setStatus(await message("STUDIESYNC_TEST_CONNECTION"));
});

$("menu-switch").addEventListener("click", async () => {
  openMenu(false);
  showView("main");
  setBusy("Skifter Google-konto…", "Vælg konto i vinduet, der åbner.");
  const result = await message("STUDIESYNC_SWITCH_ACCOUNT");
  await refreshAuth();
  setStatus(result?.ok ? { ok: true, message: "Google-konto er skiftet." } : result);
});

$("menu-logout").addEventListener("click", async () => {
  openMenu(false);
  showView("main");
  setBusy("Logger ud…", "Et øjeblik.");
  const result = await message("STUDIESYNC_LOGOUT");
  const connected = await refreshAuth();
  if (!result?.ok) setStatus(result);
  else if (!connected) { showNotConnected(); updated.textContent = ""; }
});

// --- Hovedknapper ---

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  const result = await message("STUDIESYNC_CONNECT");
  connectButton.disabled = false;
  await refreshAuth();
  setStatus(result?.ok ? { ok: true, message: "Google Kalender er forbundet." } : result);
});

syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  setBusy("Synkroniserer…", "Henter skema og opdaterer kalenderen.");
  const result = await message("STUDIESYNC_SYNC");
  syncButton.disabled = false;
  setStatus(result);
  showUpdated(await message("STUDIESYNC_STATUS"));
});

function showUpdated(result) {
  if (result?.lastUpdated) updated.textContent = "Sidst kørt: " + new Date(result.lastUpdated).toLocaleString("da-DK");
}

// --- Indstillinger ---

function fillSelect(select, values, label) {
  select.innerHTML = "";
  for (const value of values) select.add(new Option(label(value), String(value)));
}
const weekLabel = n => (n === 1 ? "1 uge" : `${n} uger`);
const minutesLabel = m => (m < 60 ? `${m} min.` : m % 60 === 0 ? (m === 60 ? "1 time" : `${m / 60} timer`) : `${m} min.`);

// Rullemenuerne indeholder altid den nuværende værdi, også hvis config.js bruger et ukendt tal
function fillChoices(settings) {
  const maxWeeks = Math.max(1, Number(CONFIG.maxWeeks) || 12);
  const weeks = [...new Set([...WEEK_CHOICES.filter(n => n <= maxWeeks), settings.scheduleWeeks])].sort((a, b) => a - b);
  const minutes = [...new Set([...INTERVAL_CHOICES, settings.autoSyncMinutes])].sort((a, b) => a - b);
  fillSelect($("weeks"), weeks, weekLabel);
  fillSelect($("interval"), minutes, minutesLabel);
}

function fillTimeZones(selected) {
  const select = $("timeZone");
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [selected];
  if (!zones.includes("UTC")) zones.push("UTC");
  if (!zones.includes(selected)) zones.push(selected);
  // Tekst som "(GMT+1) Europe/Copenhagen", sorteret efter forskydning
  select.innerHTML = "";
  for (const [id, label] of timeZoneOptions(zones)) select.add(new Option(label, id));
  select.value = selected;
}

// Lyst/mørkt: "auto" lader browserens tema (prefers-color-scheme) bestemme, ellers tvinges valget
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
  fillSelect($("theme"), THEME_CHOICES.map(([id]) => id), id => THEME_CHOICES.find(([key]) => key === id)[1]);
  $("theme").value = settings.theme;
  applyTheme(settings.theme);
  $("autosync").textContent = autoSyncText(settings);
}

async function loadSettings() {
  return resolveSettings(
    await chrome.storage.local.get(["scheduleWeeks", "autoSync", "autoSyncMinutes", "calendarName", "timeZone", "theme"]),
    CONFIG
  );
}

let savedTimer;
function flashSaved(text) {
  $("saved").textContent = text;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $("saved").textContent = ""; }, 1500);
}

// Gemmer alt fra formularen, giver baggrundsscriptet besked (alarm og kalendernavn) og viser "Gemt"
async function saveSettings() {
  const settings = resolveSettings({
    scheduleWeeks: $("weeks").value,
    autoSync: $("autoSync").checked,
    autoSyncMinutes: $("interval").value,
    calendarName: $("calendarName").value,
    timeZone: $("timeZone").value,
    theme: $("theme").value
  }, CONFIG);
  await chrome.storage.local.set(settings);
  showSettings(settings);
  flashSaved("Gemt ✓");
  await message("STUDIESYNC_SETTINGS_CHANGED");
}
for (const id of ["weeks", "autoSync", "interval", "calendarName", "timeZone", "theme"]) $(id).addEventListener("change", saveSettings);

// Nulstil: fjern brugerens valg, så config.js gælder igen
$("reset").addEventListener("click", async () => {
  await chrome.storage.local.remove(["scheduleWeeks", "autoSync", "autoSyncMinutes", "calendarName", "timeZone", "theme"]);
  showSettings(await loadSettings());
  flashSaved("Nulstillet ✓");
  await message("STUDIESYNC_SETTINGS_CHANGED");
});

$("back").addEventListener("click", () => showView("main"));

// --- Start ---

async function load() {
  showSettings(await loadSettings());
  const connected = await refreshAuth();
  if (!connected) return showNotConnected();
  const result = await message("STUDIESYNC_STATUS");
  if (result?.lastStatus) setStatus(result.lastStatus);
  showUpdated(result);
}

load();
