// Popup'ens logik: knapper, statusvisning og valg af antal uger.

// Henter elementerne fra popup.html
const state = document.getElementById("state");           // overskrift for status
const detail = document.getElementById("detail");         // uddybende statustekst
const dot = document.getElementById("dot");               // farvet prik (grøn/rød)
const syncButton = document.getElementById("sync");
const connectButton = document.getElementById("connect");
const testButton = document.getElementById("test");
const updated = document.getElementById("updated");       // "Sidst kørt: ..."
const weeksSelect = document.getElementById("weeks");     // rullemenu med antal uger

// Viser en status i popup'en (tekst + grøn/rød prik)
function setStatus(status) {
  if (!status) return;
  state.textContent = status.message || "Klar til synkronisering";
  detail.textContent = status.detail || (status.ok ? "Forbindelsen fungerer." : "Kontrollér Studie+ og prøv igen.");
  dot.className = "dot " + (status.ok ? "good" : "bad");
}

// Sender en besked til baggrundsscriptet (background.js) og venter på svaret
function message(type) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type }, resolve));
}

// Kører når popup'en åbnes: indlæs gemt antal uger og seneste status
async function load() {
  const settings = await chrome.storage.local.get({ scheduleWeeks: 4 });
  weeksSelect.value = String(settings.scheduleWeeks);
  const result = await message("STUDIESYNC_STATUS");
  if (result?.lastStatus) setStatus(result.lastStatus);
  if (result?.lastUpdated) updated.textContent = "Sidst kørt: " + new Date(result.lastUpdated).toLocaleString("da-DK");
}

// "Test Studie+ forbindelsen": knappen låses mens testen kører
testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  setStatus({ ok: false, message: "Tester Studie+…", detail: "Kontrollerer den aktive session og skemaforbindelsen." });
  const result = await message("STUDIESYNC_TEST_CONNECTION");
  testButton.disabled = false;
  setStatus(result);
});

// "Forbind Google Kalender": beder om Google-login
connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  const result = await message("STUDIESYNC_CONNECT");
  connectButton.disabled = false;
  setStatus(result?.ok ? { ok: true, message: "Google Kalender er forbundet." } : { ok: false, message: result?.message });
});

// "Synkronisér nu": henter skemaet og opdaterer kalenderen
syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  state.textContent = "Synkroniserer…";
  detail.textContent = "Henter skema og opdaterer kalenderen.";
  const result = await message("STUDIESYNC_SYNC");
  syncButton.disabled = false;
  setStatus(result);
});

// Gem antal uger, når brugeren ændrer valget (begrænset til 1-12)
weeksSelect.addEventListener("change", async () => {
  const weeks = Math.max(1, Math.min(12, Number(weeksSelect.value) || 4));
  await chrome.storage.local.set({ scheduleWeeks: weeks });
});

load();
