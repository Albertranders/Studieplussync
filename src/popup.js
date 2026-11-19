// Render the popup dashboard, onboarding guide, navigation menu, and settings.
import { INTERVAL_CHOICES, THEME_CHOICES, WEEK_CHOICES, autoSyncText, resolveSettings, timeZoneLabel, timeZoneOptions } from "./settings.js";
import { canOpenGuide, shouldAutoOpenGuide } from "./onboarding.js";
import { isConnected } from "./auth.js";
import { todayLessons } from "./lessons-cache.js";

const CONFIG = globalThis.STUDIESYNC_CONFIG;
const $ = id => document.getElementById(id);
const viewMain = $("view-main"), viewSettings = $("view-settings"), viewGuide = $("view-guide");
let currentGuideAction = null;
let guidePausedForSettings = false;
let guideFeedback = "";
let guideFeedbackType = "neutral";
const state = $("state"), detail = $("detail"), dot = $("dot"), updated = $("last-sync-value");
const syncButton = $("sync"), connectButton = $("connect");
const menu = $("menu"), menuButton = $("menu-button"), historyPanel = $("history-panel");

function message(type) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type }, response => {
    void chrome.runtime.lastError; // Read the callback error to prevent an unchecked-runtime warning.
    resolve(response);
  }));
}
// Apply a background status message to the dashboard's visible status elements.
function setStatus(status) {
  if (!status) return;
  const c = status.ok && !status.detail ? status.counts : null;
  if (c && c.lessons !== undefined) {
    // Vellykket synkronisering: kort titel og kun de ændringer, der faktisk skete.
    const parts = [[c.created, "nye"], [c.updated, "ændrede"], [c.deleted, "slettede"]]
      .filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
    state.textContent = "Synkroniseret";
    detail.textContent = parts.length ? parts.join(", ") : "Ingen ændringer";
  } else {
    state.textContent = status.message || "Klar til synkronisering";
    detail.textContent = status.detail || (status.ok ? "Forbindelsen fungerer." : "Kontrollér Studie+ og prøv igen.");
  }
  dot.className = "dot " + (status.ok ? "good" : "bad");
  // Ved fejl: vis et link, der opretter et GitHub-issue med fejlkode og tekniske oplysninger udfyldt.
  const link = $("issue-link");
  link.hidden = status.ok || !status.issueUrl;
  if (!link.hidden) link.href = status.issueUrl;
}
// Replace the current status with a temporary in-progress message.
function setBusy(title, text) {
  state.textContent = title; detail.textContent = text; dot.className = "dot";
  $("issue-link").hidden = true;
}
// Show one of the popup's top-level screens and hide the others.
function showView(name) {
  viewMain.hidden = name !== "main";
  viewSettings.hidden = name !== "settings";
  viewGuide.hidden = name !== "guide";
  if (name === "settings") ensureTimeZones();
  document.body.classList.toggle("wide", name === "main"); // to kolonner på forsiden
}
// Synchronize the menu's visibility and accessibility state.
function openMenu(open) {
  menu.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
}
menuButton.addEventListener("click", event => { event.stopPropagation(); openMenu(menu.hidden); });
document.addEventListener("click", event => { if (!menu.contains(event.target) && event.target !== menuButton) openMenu(false); });
document.addEventListener("keydown", event => { if (event.key === "Escape") openMenu(false); });

// Read the connected Google account and update account-dependent controls.
async function refreshAuth(stored) {
  stored ??= await chrome.storage.local.get(["googleConnected", "loginHint", "webToken"]);
  const auth = { connected: isConnected(stored), email: stored.loginHint || "" };
  const connected = Boolean(auth.connected);
  connectButton.hidden = connected;
  syncButton.hidden = !connected;
  $("menu-account").hidden = !connected;
  $("menu-email").textContent = auth.email ? `Forbundet som ${auth.email}` : "Google-konto forbundet";
  $("connection-value").textContent = connected ? "Google forbundet" : "Ikke forbundet";
  $("connection-detail").textContent = connected ? (auth.email || "Google Kalender er klar") : "Log ind for at starte";
  return connected;
}
// Show the connection instructions whenever there is no linked Google account.
function showNotConnected() { setBusy("Google Kalender er ikke forbundet", "Forbind din Google-konto for at komme i gang."); }

// Format an ISO date for the Danish-language interface.
function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("da-DK", { weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" });
}
// Kort tidspunkt til smalle kort: "i dag kl. 10.39" eller "17. nov. kl. 10.39".
function formatShort(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  const day = date.toDateString() === new Date().toDateString()
    ? "i dag" : date.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  return `${day} kl. ${time}`;
}
// Format a lesson time as HH:MM in the Danish locale.
const formatClock = value => new Date(value).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });

// Show today's complete schedule. `lessons` is a list, "loading" or "failed".
function renderToday(lessons, connected) {
  const list = $("today-list"), empty = $("today-empty");
  $("today-title").textContent = new Date().toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
  list.replaceChildren();
  const emptyText = !connected ? "Forbind Google Kalender for at se dagens skema."
    : lessons === "loading" ? "Henter dagens skema…"
    : lessons === "failed" ? "Dagens skema kunne ikke hentes. Synkronisér for at hente det."
    : !lessons?.length ? "Ingen lektioner i dag. Synkronisér, hvis det ikke passer."
    : "";
  empty.textContent = emptyText;
  empty.hidden = !emptyText;
  const now = Date.now();
  for (const lesson of emptyText ? [] : lessons) {
    const start = new Date(lesson.start).getTime();
    const end = lesson.end ? new Date(lesson.end).getTime() : start;
    const row = document.createElement("li");
    row.className = "today-item" + (end <= now ? " past" : start <= now ? " now" : "");
    const time = document.createElement("time");
    time.className = "today-time";
    time.dateTime = lesson.start;
    time.textContent = lesson.end ? `${formatClock(lesson.start)}–${formatClock(lesson.end)}` : formatClock(lesson.start);
    const top = document.createElement("div");
    top.className = "today-top";
    top.append(time);
    if (lesson.location) {
      const room = document.createElement("span");
      room.className = "today-room";
      room.textContent = `Lokale ${lesson.location}`;
      top.append(room);
    }
    const subject = document.createElement("strong");
    subject.className = "today-subject";
    subject.textContent = lesson.summary;
    subject.title = lesson.summary; // fuldt navn ved hover, hvis det er afkortet
    row.append(top, subject);
    list.append(row);
  }
}
// Refresh sync metadata and today's schedule. Everything comes from the local storage, so it is instant.
async function refreshDashboard(connected = true, stored) {
  stored ??= await chrome.storage.local.get(["lastStatus", "lastUpdated", "lessonsCache"]);
  // Keep the disconnected message visible rather than replacing it with a stale status.
  if (connected && stored.lastStatus) setStatus(stored.lastStatus);
  if (stored.lastUpdated) {
    updated.textContent = formatShort(stored.lastUpdated) || "Ukendt tidspunkt";
    $("last-sync-detail").textContent = stored.lastStatus?.ok ? "Gennemført" : "Forsøget fejlede";
  } else {
    updated.textContent = "Aldrig";
    $("last-sync-detail").textContent = "Endnu ikke kørt";
  }
  if (!connected) { renderToday([], false); return; }
  const lessons = todayLessons(stored.lessonsCache);
  if (lessons) { renderToday(lessons, true); return; }
  // Ingen lokal kopi endnu (fx lige efter en opdatering): vis en besked med det samme, og hent dagens
  // skema fra Google i baggrunden. Efter næste synkronisering findes kopien, og det sker ikke igen.
  renderToday("loading", true);
  message("STUDIESYNC_DASHBOARD").then(data => renderToday(data?.todayLessons ?? "failed", true));
}
// Render stored sync history using DOM nodes and textContent rather than HTML strings.
async function renderHistory() {
  const list = $("history-list");
  list.replaceChildren();
  const { syncHistory: history } = await chrome.storage.local.get(["syncHistory"]);
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

$("menu-dashboard").addEventListener("click", async () => {
  openMenu(false);
  if (!await resumeGuideFromSettings()) showView("main");
});
$("menu-settings").addEventListener("click", () => { openMenu(false); showView("settings"); });
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

// Connect the selected Google account, refresh account status, and report the result.
async function connectGoogle() {
  connectButton.disabled = true;
  const result = await message("STUDIESYNC_CONNECT");
  connectButton.disabled = false;
  await refreshAuth();
  setStatus(result?.ok ? {ok:true,message:"Google Kalender er forbundet."} : result);
  await refreshDashboard();
  return Boolean(result?.ok);
}
// Run a calendar sync and refresh the dashboard and visible history afterward.
async function syncCalendar() {
  syncButton.disabled = true;
  setBusy("Synkroniserer…", "Henter skema og opdaterer kalenderen. Første synkronisering kan tage lidt tid.");
  const result = await message("STUDIESYNC_SYNC");
  syncButton.disabled = false;
  if (result?.busy) setBusy(result.message, result.detail);
  else setStatus(result);
  await refreshDashboard();
  if (!historyPanel.hidden) await renderHistory();
  return Boolean(result?.ok);
}
connectButton.addEventListener("click", connectGoogle);
syncButton.addEventListener("click", syncCalendar);
// Each onboarding step requires its associated action to be completed before continuing.
const guideSteps = [
  { icon:"1", title:"Åbn Studie+", body:"Åbn Studie+ i en browserfane, og log ind. Lad fanen være åben, mens StudieSync bruges.", tip:"StudieSync bruger din aktive session. Du skal ikke indtaste din Studie+-adgangskode i udvidelsen.", action:"Test Studie+ forbindelse", task:"studyplus" },
  { icon:"2", title:"Forbind Google Kalender", body:"Forbind din Google-konto, og giv StudieSync adgang til at oprette og opdatere din skemakalender.", tip:"Brug den Google-konto, du vil have skemaet vist i.", action:"Forbind Google Kalender", task:"google" },
  { icon:"3", title:"Synkronisér dit skema", body:"Start synkroniseringen. StudieSync henter dine lektioner og opretter dem i sin egen kalender i Google Kalender.", tip:"Den første synkronisering kan tage lidt tid, hvis skemaet er langt. Lad vinduet være åbent, indtil den er færdig.", action:"Synkronisér skema", task:"sync" },
  { icon:"4", title:"Tilpas indstillingerne", body:"Vælg antal uger, automatisk synkronisering, tidszone, kalendernavn og farvetema under Indstillinger. Dine valg gemmes automatisk.", tip:"Automatisk synkronisering kræver, at browseren kører, og at en Studie+-fane er åben og logget ind.", action:"Åbn indstillinger", task:"settings" },
  { icon:"!", title:"HUSK!", body:"StudieSync fungerer kun, så længe Studie+ er åben i en browserfane, og du er logget ind. Lukker du Studie+, kan StudieSync ikke hente eller opdatere dit skema.", tip:"Lad Studie+-fanen være åben, når du bruger automatisk synkronisering.", action:"Afslut introduktion", task:"finish" }
];
let guideIndex = 0;
let guideCompletedSteps = [];
let guideIsCompleted = false;
// Load the persisted completion state for each onboarding step.
async function loadGuideProgress(stored) {
  stored ??= await chrome.storage.local.get(["guideCompletedSteps"]);
  guideCompletedSteps = Array.isArray(stored.guideCompletedSteps)
    ? guideSteps.map((_, i) => stored.guideCompletedSteps.includes(i))
    : guideSteps.map(() => false);
}
// Update the guide content, completion feedback, and progress indicators.
function renderGuide() {
  const step = guideSteps[guideIndex];
  $("guide-step-count").textContent = `${guideIndex+1} / ${guideSteps.length}`;
  $("guide-kicker").textContent = guideSteps[guideIndex].task === "finish" ? "VIGTIGT AT HUSKE" : `TRIN ${guideIndex+1} AF ${guideSteps.length}`;
  $("guide-icon").textContent = guideCompletedSteps[guideIndex] ? "✓" : step.icon;
  $("guide-title").textContent = step.title;
  $("guide-body").textContent = step.body;
  $("guide-tip").textContent = step.tip;
  $("guide-action").textContent = step.action;
  $("guide-action").disabled = Boolean(currentGuideAction) || (guideCompletedSteps[guideIndex] && step.task !== "finish");
  $("guide-status").className = "guide-status " + (guideCompletedSteps[guideIndex] ? "success" : guideFeedbackType);
  $("guide-status").textContent = guideCompletedSteps[guideIndex] ? (step.task === "finish" ? "Introduktionen er gennemført." : "Gennemført. Du kan gå videre.") : (guideFeedback || (step.task === "finish" ? "Læs påmindelsen, og afslut introduktionen." : "Udfør handlingen for at kontrollere dette trin."));
  $("guide-progress-fill").style.width = `${guideCompletedSteps.filter(Boolean).length/guideSteps.length*100}%`;
  $("guide-back").disabled = guideIndex === 0;
  const allDone = guideCompletedSteps.every(Boolean);
  $("guide-next").disabled = !guideCompletedSteps[guideIndex];
  $("guide-next").textContent = guideIndex === guideSteps.length-1 ? "Afslut guide" : "Næste trin";
  $("guide-setting-status").textContent = allDone
    ? "Alle trin er gennemført."
    : `${guideCompletedSteps.filter(Boolean).length} af ${guideSteps.length} trin gennemført.`;
}
// Open the guide at its first incomplete step, or restart at the beginning when complete.
async function openGuide() {
  if (!canOpenGuide({ guideCompleted: guideIsCompleted })) return;
  guidePausedForSettings = false;
  $("guide-resume").hidden = true;
  await loadGuideProgress();
  guideIndex = guideCompletedSteps.findIndex(done => !done);
  if (guideIndex < 0) guideIndex = 0;
  renderGuide();
  showView("guide");
}
async function resumeGuideFromSettings() {
  if (!guidePausedForSettings) return false;
  guidePausedForSettings = false;
  $("guide-resume").hidden = true;
  guideCompletedSteps[guideIndex] = true;
  guideFeedback = "Indstillingerne er gennemgået. Du kan gå videre.";
  guideFeedbackType = "success";
  await chrome.storage.local.set({ guideCompletedSteps });
  renderGuide();
  showView("guide");
  return true;
}
// Persist guide completion and return to the settings screen.
async function finishGuide() {
  await chrome.storage.local.set({ guideCompleted: true });
  guideIsCompleted = true;
  $("guide-entry").hidden = true;
  $("guide-setting-status").textContent = "Alle trin er gennemført.";
  showView("settings");
}
$("guide-start").addEventListener("click", openGuide);
$("guide-resume").addEventListener("click", resumeGuideFromSettings);
$("guide-close").addEventListener("click", () => {
  guidePausedForSettings = false;
  $("guide-resume").hidden = true;
  showView("settings");
});
$("guide-action").addEventListener("click", async () => {
  const step = guideSteps[guideIndex];
  if (currentGuideAction) return;
  currentGuideAction = step.task;
  $("guide-action").disabled = true;
  $("guide-action").textContent = "Arbejder…";
  guideFeedback = "Kontrollerer…";
  guideFeedbackType = "neutral";
  let success = false;
    try {
      if (step.task === "studyplus") {
        const result = await message("STUDIESYNC_TEST_CONNECTION");
        setStatus(result);
        success = Boolean(result?.ok);
        if (!success) { guideFeedback = "Studie+ kunne ikke findes eller svarede ikke. Åbn Studie+, log ind, eller genindlæs fanen, og prøv igen."; guideFeedbackType = "error"; }
      } else if (step.task === "google") {
        success = await connectGoogle();
        if (!success) { guideFeedback = "Google Kalender kunne ikke forbindes. Kontrollér login og tilladelser, og prøv igen."; guideFeedbackType = "error"; }
      } else if (step.task === "sync") {
        success = await syncCalendar();
        if (!success) { guideFeedback = "Synkroniseringen blev ikke gennemført. Kontrollér, at Studie+ er åben, og prøv igen."; guideFeedbackType = "error"; }
      } else if (step.task === "settings") {
        guidePausedForSettings = true;
        $("guide-resume").hidden = false;
        showView("settings");
        return;
      } else if (step.task === "finish") {
        success = true;
      }
      if (success) {
        guideFeedback = "Kontrollen er gennemført. Du kan gå videre.";
        guideFeedbackType = "success";
        guideCompletedSteps[guideIndex] = true;
        await chrome.storage.local.set({ guideCompletedSteps });
      }
    } catch (error) {
      guideFeedback = error?.message || "Handlingen mislykkedes. Prøv igen.";
      guideFeedbackType = "error";
    } finally {
      currentGuideAction = null;
      renderGuide();
    }
  });

$("guide-back").addEventListener("click", () => {
  if (guideIndex === 0) return;

  guideIndex -= 1;
  guideFeedback = "";
  guideFeedbackType = "neutral";
  renderGuide();
});

$("guide-next").addEventListener("click", async () => {
  if (!guideCompletedSteps[guideIndex]) return;

  if (guideIndex < guideSteps.length - 1) {
    guideIndex += 1;
    guideFeedback = "";
    guideFeedbackType = "neutral";
    renderGuide();
    return;
  }

  if (guideCompletedSteps.every(Boolean)) {
    await finishGuide();
  }
});

// Settings controls and their display helpers.
// Populate a dropdown with values and a caller-provided display label.
function fillSelect(select, values, label) {
  select.replaceChildren();
  for (const value of values) select.add(new Option(label(value), String(value)));
}
const weekLabel = n => n === 1 ? "1 uge" : `${n} uger`;
const minutesLabel = m => m < 60 ? `${m} min.` : m % 60 === 0 ? (m === 60 ? "1 time" : `${m/60} timer`) : `${m} min.`;
// Add the configured week and interval choices while preserving current custom values.
function fillChoices(settings) {
  const maxWeeks = Math.max(1, Number(CONFIG.maxWeeks) || 12);
  const weeks = [...new Set([...WEEK_CHOICES.filter(n => n <= maxWeeks), settings.scheduleWeeks])].sort((a,b)=>a-b);
  const minutes = [...new Set([...INTERVAL_CHOICES, settings.autoSyncMinutes])].sort((a,b)=>a-b);
  fillSelect($("weeks"), weeks, weekLabel); fillSelect($("interval"), minutes, minutesLabel);
}
// Tidszonelisten har ca. 400 poster og er dyr at bygge. Før indstillingerne åbnes, indeholder
// vælgeren kun den valgte zone; den fulde liste bygges første gang, den skal bruges.
let zonesBuilt = false;
function fillTimeZones(selected) {
  const select = $("timeZone");
  if (zonesBuilt && ![...select.options].some(option => option.value === selected)) {
    select.add(new Option(timeZoneLabel(selected), selected));
  } else if (!zonesBuilt) {
    select.replaceChildren(new Option(timeZoneLabel(selected), selected));
  }
  select.value = selected;
}
function ensureTimeZones() {
  if (zonesBuilt) return;
  zonesBuilt = true;
  const select = $("timeZone"), selected = select.value;
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [selected];
  if (!zones.includes("UTC")) zones.push("UTC");
  if (!zones.includes(selected)) zones.push(selected);
  select.replaceChildren();
  for (const [id, label] of timeZoneOptions(zones)) select.add(new Option(label, id));
  select.value = selected;
}
// Apply an explicit light/dark theme or defer to the browser's system preference.
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
// Fill all settings controls from a normalized settings object.
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
// Read, normalize, and return settings saved by the extension.
async function loadSettings() {
  return resolveSettings(await chrome.storage.local.get(["scheduleWeeks","autoSync","autoSyncMinutes","calendarName","timeZone","theme"]), CONFIG);
}
let savedTimer;
// Briefly show the result of a settings save or reset.
function flashSaved(text) {
  $("saved").textContent = text;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $("saved").textContent = ""; }, 1500);
}
// Normalize and persist the current settings, then notify the service worker.
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
$("back").addEventListener("click", async () => {
  if (!await resumeGuideFromSettings()) showView("main");
});

// Initialize settings, version, account state, dashboard, and onboarding state.
// Alt hentes i ét kald til lageret, så popup'en kan tegnes straks uden at vente på baggrundsscriptet.
const LOAD_KEYS = [
  "scheduleWeeks", "autoSync", "autoSyncMinutes", "calendarName", "timeZone", "theme",
  "googleConnected", "loginHint", "webToken", "lastStatus", "lastUpdated", "lessonsCache",
  "guideCompletedSteps", "guideCompleted", "guideAutoOpened"
];
async function load() {
  const stored = await chrome.storage.local.get(LOAD_KEYS);
  const settings = resolveSettings(stored, CONFIG);
  applyTheme(settings.theme);
  showSettings(settings);
  const manifest = chrome.runtime.getManifest();
  $("version").textContent = `v${manifest.version}`;
  const connected = await refreshAuth(stored);
  if (!connected) showNotConnected();
  await refreshDashboard(connected, stored);
  await loadGuideProgress(stored);
  const { guideCompleted, guideAutoOpened } = stored;
  guideIsCompleted = Boolean(guideCompleted);
  $("guide-entry").hidden = !canOpenGuide({ guideCompleted: guideIsCompleted });
  $("guide-setting-status").textContent = guideCompletedSteps.every(Boolean)
    ? "Alle trin er gennemført."
    : `${guideCompletedSteps.filter(Boolean).length} af ${guideSteps.length} trin gennemført.`;
  const allStepsCompleted = guideCompletedSteps.every(Boolean);
  if (shouldAutoOpenGuide({ guideCompleted, guideAutoOpened, allStepsCompleted })) {
    await chrome.storage.local.set({ guideAutoOpened: true });
    await openGuide();
  }
  // Byg den fulde tidszoneliste i ro og mag, når popup'en er tegnet.
  (globalThis.requestIdleCallback || (fn => setTimeout(fn, 300)))(ensureTimeZones);
}
load().catch(error => {
  setBusy("Dashboard kunne ikke indlæses", error?.message || "Genindlæs udvidelsen, og prøv igen.");
});
