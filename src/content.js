// Kører i Studie+-siden: henter skemaet via GWT-modulet og svarer på beskeder fra baggrunden.
(() => {
  "use strict";
  const CONFIG = globalThis.STUDIESYNC_CONFIG;

  // Formatér en lokal dato som ÅÅÅÅ-MM-DD.
  function formatDate(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  // Periode: fra mandag i denne uge og det valgte antal uger frem.
  function scheduleRange(weeks) {
    const count = Math.max(1, Math.min(CONFIG.maxWeeks, Number(weeks) || CONFIG.defaultWeeks));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + count * 7 - 1);
    return { start: formatDate(start), end: formatDate(end) };
  }

  // Hent lektioner for perioden. GWT-modulet kaster selv fejl med kode (fx E406).
  async function fetchLessons(weeks) {
    if (!window.StudySyncGwt) throw new StudySyncError("E303", "GWT-modulet blev ikke indlæst. Genindlæs Studie+ fanen.");
    const dateRange = scheduleRange(weeks);
    const { lessons } = await window.StudySyncGwt.fetchSchedule(dateRange.start, dateRange.end);
    return { lessons, dateRange };
  }

  // Forbindelsestest: tæl kun lektioner.
  async function testConnection(weeks) {
    const { lessons, dateRange } = await fetchLessons(weeks);
    return { lessonCount: lessons.length, dateRange };
  }

  // Læs skema til synkronisering (valideres af background.js før kalenderen røres).
  async function readSchedule(weeks) {
    const { lessons, dateRange } = await fetchLessons(weeks);
    return { lessons, dateRange, count: lessons.length, pageTitle: document.title };
  }

  const handlers = {
    STUDIESYNC_TEST_CONNECTION: testConnection,
    STUDIESYNC_READ_SCHEDULE: readSchedule
  };

  // Fortæl baggrundsscriptet, at Studie+ er åbnet, så skemaet kan synkroniseres, mens du bruger siden.
  try { chrome.runtime.sendMessage({ type: "STUDIESYNC_PAGE_READY" }, () => void chrome.runtime.lastError); } catch { /* udvidelsen er genindlæst */ }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = handlers[message?.type];
    if (!handler) return; // ukendte beskeder ignoreres
    handler(message.weeks)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true; // svar sendes asynkront
  });
})();
