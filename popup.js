const state = document.getElementById("state");
const detail = document.getElementById("detail");
const dot = document.getElementById("dot");
const syncButton = document.getElementById("sync");
const connectButton = document.getElementById("connect");
const testButton = document.getElementById("test");
const updated = document.getElementById("updated");\nconst weeksSelect = document.getElementById("weeks");

function setStatus(status) {
  if (!status) return;
  state.textContent = status.message || "Klar til synkronisering";
  detail.textContent = status.detail || (status.ok ? "Forbindelsen fungerer." : "Kontrollér Studie+ og prøv igen.");
  dot.className = "dot " + (status.ok ? "good" : "bad");
}
function message(type) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type }, resolve));
}
async function load() {
  const result = await message("STUDIESYNC_STATUS");
  if (result?.lastStatus) setStatus(result.lastStatus);
  if (result?.lastUpdated) updated.textContent = "Sidst kørt: " + new Date(result.lastUpdated).toLocaleString("da-DK");
}
testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  setStatus({ ok: false, message: "Tester Studie+…", detail: "Kontrollerer den aktive session og skemaforbindelsen." });
  const result = await message("STUDIESYNC_TEST_CONNECTION");
  testButton.disabled = false;
  setStatus(result);
});
connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  const result = await message("STUDIESYNC_CONNECT");
  connectButton.disabled = false;
  setStatus(result?.ok ? { ok: true, message: "Google Kalender er forbundet." } : { ok: false, message: result?.message });
});
syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  state.textContent = "Synkroniserer…";
  detail.textContent = "Henter skema og opdaterer kalenderen.";
  const result = await message("STUDIESYNC_SYNC");
  syncButton.disabled = false;
  setStatus(result);
  await weeksSelect.addEventListener("change", async () => {\n  const weeks = Math.max(1, Math.min(12, Number(weeksSelect.value) || 4));\n  await chrome.storage.local.set({ scheduleWeeks: weeks });\n});\n\nload();
});
load();