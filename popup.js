const state = document.getElementById("state");
const detail = document.getElementById("detail");
const dot = document.getElementById("dot");
const syncButton = document.getElementById("sync");
const connectButton = document.getElementById("connect");
const updated = document.getElementById("updated");

function setStatus(status) {
  if (!status) return;
  state.textContent = status.message || "Klar til synkronisering";
  detail.textContent = status.ok ? "Google Kalender er opdateret." : "Kontrollér Studie+ og prøv igen.";
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
  await load();
});
load();
