// Run in the Studie+ page to read schedules and respond to extension messages.
// Schedule extraction uses the GWT module; the visible-SVG reader remains as a helper.
(() => {
  "use strict";
  const CONFIG = globalThis.STUDIESYNC_CONFIG;   // indstillinger fra config.js

  // Map Danish weekday abbreviations to JavaScript weekday numbers (Sunday is zero).
  const DAY_NAMES = {
    man: 1, tir: 2, ons: 3, tor: 4, fre: 5, "lør": 6, "søn": 0
  };

  // Use a date in the page URL as the reference date, or today's UTC date as fallback.
  function referenceDate() {
    const match = location.href.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
    if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  // Resolve a weekday/date header to the nearest matching calendar date.
  function dateFromHeader(label, reference) {
    const match = label.trim().match(/^(man|tir|ons|tor|fre|lør|søn)\s+(\d{1,2})\/(\d{1,2})$/i);
    if (!match) return "";
    const weekday = DAY_NAMES[match[1].toLowerCase()];
    const day = Number(match[2]);
    const month = Number(match[3]);
    const candidates = [];
    // Prøv året før, samme år og året efter
    for (const year of [reference.getUTCFullYear() - 1, reference.getUTCFullYear(), reference.getUTCFullYear() + 1]) {
      const date = new Date(Date.UTC(year, month - 1, day));
      // Kun gyldige datoer, hvor ugedagen stemmer
      if (date.getUTCDate() === day && date.getUTCMonth() === month - 1 && date.getUTCDay() === weekday) candidates.push(date);
    }
    if (!candidates.length) return "";
    // Vælg kandidaten nærmest referencedatoen
    candidates.sort((a, b) => Math.abs(a.getTime() - reference.getTime()) - Math.abs(b.getTime() - reference.getTime()));
    const chosen = candidates[0];
    return [chosen.getUTCFullYear(), String(chosen.getUTCMonth() + 1).padStart(2, "0"), String(chosen.getUTCDate()).padStart(2, "0")].join("-");
  }

  // Read each schedule date column and its screen position.
  function readDateColumns(reference) {
    return [...document.querySelectorAll("th.fc-widget-header")].map(header => {
      const label = header.querySelector(".gwt-Label")?.textContent?.trim() || "";
      const rect = header.getBoundingClientRect();
      const date = dateFromHeader(label, reference);
      if (!date || rect.width <= 0) return null; // ikke en dagskolonne
      return { date, center: rect.left + rect.width / 2, width: rect.width };
    }).filter(Boolean);
  }

  // Collect text and coordinates from an SVG lesson group.
  function readSvgText(node) {
    return [...node.querySelectorAll("text")].map(element => ({
      text: (element.textContent || "").replace(/\s+/g, " ").trim(),
      x: Number(element.getAttribute("x")),
      y: Number(element.getAttribute("y"))
    })).filter(item => item.text);
  }

  // Match a lesson group to the closest date-column center.
  function nearestDate(node, columns) {
    const matrix = node.getScreenCTM?.();
    const rect = node.querySelector("rect");
    if (!matrix || !rect || !columns.length) return "";
    // Boksens midte i skærmkoordinater
    const center = matrix.e + Number(rect.getAttribute("x") || 0) + Number(rect.getAttribute("width") || 0) / 2;
    let nearest = null;
    for (const column of columns) {
      const distance = Math.abs(center - column.center);
      if (!nearest || distance < nearest.distance) nearest = { column, distance };
    }
    // Afvis hvis boksen ligger for langt fra den nærmeste kolonne
    if (!nearest || nearest.distance > Math.max(30, nearest.column.width * 0.4)) return "";
    return nearest.column.date;
  }

  // Parse one visible SVG lesson group, returning null when required fields are missing.
  function parseLesson(node, columns) {
    const texts = readSvgText(node);
    // Teksten med tidsrummet, fx "08:15 - 09:45"
    const timeText = texts.find(item => /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(item.text));
    if (!timeText) return null;
    const timeMatch = timeText.text.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    // Faget står på linje y=28; ellers den første tekst, der hverken er tid eller detaljelinjen (y=44)
    const subjectText = texts.find(item => item.y === 28 && item.text !== timeText.text) ||
      texts.find(item => item !== timeText && item.y !== 44 && !/^\d{1,2}:\d{2}/.test(item.text));
    const date = nearestDate(node, columns);
    if (!date || !subjectText) return null;
    // Detaljelinjen (y=44): lærer til venstre, lokale til højre
    const details = texts.filter(item => item.y === 44);
    const teacher = details.find(item => item.x <= 30)?.text || "";
    const room = details.find(item => item.x > 70)?.text || "";
    // Klassekode ligger uden for boksen (negative koordinater)
    const classCode = texts.find(item => item.x < 0 && item.y < 0)?.text || "";
    const subject = subjectText.text;
    const start = timeMatch[1].padStart(5, "0"); // "8:15" -> "08:15"
    const end = timeMatch[2].padStart(5, "0");
    // id'et er en sammensat nøgle, da boksene ikke har et rigtigt lektions-id
    return { id: [date, start, subject, room, teacher, classCode].join("|"), date, start, end, subject, room, teacher, homework: "", note: "" };
  }

  // Read and sort all lessons currently visible on the page.
  function readVisibleLessons() {
    const reference = referenceDate();
    const columns = readDateColumns(reference);
    if (!columns.length) throw new StudySyncError("E407", "Kunne ikke finde datooverskrifterne i Studie+ skemaet.");
    // Lektionsboksene har en genereret CSS-klasse (kan ændre sig, når Studie+ opdateres)
    const nodes = [...document.querySelectorAll("g.O2HAI5C-h-b")];
    const lessons = [];
    const seen = new Set(); // undgå dubletter
    for (const node of nodes) {
      const lesson = parseLesson(node, columns);
      if (!lesson || seen.has(lesson.id)) continue;
      seen.add(lesson.id);
      lessons.push(lesson);
    }
    // Sortér efter dato og starttid
    lessons.sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
    return lessons;
  }

  // Format a local date as YYYY-MM-DD.
  function formatDate(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  // Calculate the schedule range from this week's Monday for the requested number of weeks.
  function scheduleRange(weeks) {
    const count = Math.max(1, Math.min(CONFIG.maxWeeks, Number(weeks) || CONFIG.defaultWeeks));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // tilbage til mandag
    const end = new Date(start);
    end.setDate(end.getDate() + count * 7 - 1); // søndag i den sidste uge
    return { start: formatDate(start), end: formatDate(end) };
  }

  // Verify the connection by fetching the schedule and counting lessons.
  async function testConnection(weeks) {
    if (!window.StudySyncGwt) throw new StudySyncError("E303", "GWT-modulet blev ikke indlæst. Genindlæs Studie+ fanen.");
    const range = scheduleRange(weeks);
    const result = await window.StudySyncGwt.fetchSchedule(range.start, range.end);
    return { ...result, lessonCount: result.lessons?.length || 0, dateRange: range };
  }

  // Fetch lessons through the GWT module and return any extraction error to the caller.
  async function extractLessons(weeks) {
    const range = scheduleRange(weeks);
    let gwt = { ok: false, error: new StudySyncError("E303", "GWT-modulet blev ikke indlæst.").message };
    if (window.StudySyncGwt) {
      try { gwt = await window.StudySyncGwt.fetchSchedule(range.start, range.end); }
      catch (error) { gwt = { ok: false, error: String(error?.message || error) }; }
    }
    return { lessons: gwt.ok && Array.isArray(gwt.lessons) ? gwt.lessons : [], gwt, dateRange: range };
  }

  // Handle asynchronous messages from the extension service worker.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Testkald: bare tæl lektioner
    if (message?.type === "STUDIESYNC_TEST_CONNECTION") {
      testConnection(message.weeks).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    // Andre beskedtyper end "læs skema" ignoreres
    if (message?.type !== "STUDIESYNC_READ_SCHEDULE") return;
    extractLessons(message.weeks).then(({ lessons, gwt, dateRange }) => {
      // Gyldigt = mindst én lektion, og alle har dato, tider og fag
      const valid = Array.isArray(lessons) && lessons.length > 0 && lessons.every(l => l.date && l.start && l.end && l.subject);
      sendResponse({ ok: valid && gwt.ok === true, lessons, gwt, pageTitle: document.title, pageUrl: location.href, count: lessons.length, dateRange, error: valid && gwt.ok === true ? "" : (gwt.error || new StudySyncError("E501", "GWT-dataene kunne ikke valideres. Synkronisering er sat på pause.").message) });
    }).catch(error => sendResponse({ ok: false, lessons: [], error: String(error?.message || error) }));
    return true;
  });
})();
