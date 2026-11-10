(() => {
  "use strict";

  const DATE_KEYS = ["data-date", "data-day", "data-datevalue", "data-start-date"];
  const START_KEYS = ["data-start", "data-start-time", "data-begin", "data-from"];
  const END_KEYS = ["data-end", "data-end-time", "data-finish", "data-to"];
  const ID_KEYS = ["data-lesson-id", "data-skema-id", "data-event-id", "data-id"];

  function attr(node, keys) {
    for (const key of keys) {
      const value = node.getAttribute?.(key);
      if (value) return value.trim();
    }
    return "";
  }

  function normaliseDate(value) {
    if (!value) return "";
    const iso = value.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    const dk = value.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
    if (dk) return `${dk[3]}-${dk[2].padStart(2, "0")}-${dk[1].padStart(2, "0")}`;
    return "";
  }

  function normaliseTime(value) {
    if (!value) return "";
    const match = value.match(/(?:T|^|\s)(\d{1,2})[:.](\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
  }

  function textOf(node) {
    return (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findDate(node) {
    for (let current = node; current && current !== document.body; current = current.parentElement) {
      const direct = normaliseDate(attr(current, DATE_KEYS));
      if (direct) return direct;
      const time = current.querySelector?.("time[datetime]");
      if (time) {
        const fromTime = normaliseDate(time.getAttribute("datetime"));
        if (fromTime) return fromTime;
      }
    }
    return "";
  }

  function findTimeRange(node) {
    const startAttr = normaliseTime(attr(node, START_KEYS));
    const endAttr = normaliseTime(attr(node, END_KEYS));
    if (startAttr && endAttr) return [startAttr, endAttr];

    const timeNodes = [...node.querySelectorAll("time[datetime], time")];
    const times = timeNodes.map(n => normaliseTime(n.getAttribute("datetime") || textOf(n))).filter(Boolean);
    if (times.length >= 2) return [times[0], times[1]];

    const match = textOf(node).match(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/);
    if (match) return [
      `${match[1].padStart(2, "0")}:${match[2]}`,
      `${match[3].padStart(2, "0")}:${match[4]}`
    ];
    return ["", ""];
  }

  function clean(value) {
    return (value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function extractNode(node) {
    const raw = textOf(node);
    const [start, end] = findTimeRange(node);
    const date = findDate(node);
    if (!date || !start || !end || !raw) return null;

    const subject = clean(
      attr(node, ["data-subject", "data-title", "aria-label"]) ||
      node.querySelector?.("[data-subject], .subject, .title, h1, h2, h3")?.textContent ||
      raw.replace(/\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}/, "")
    );
    if (!subject || subject.length > 180) return null;

    const id = attr(node, ID_KEYS) || `${date}|${start}|${subject}`;
    const room = clean(attr(node, ["data-room"]) || node.querySelector?.("[data-room], .room")?.textContent || "");
    const teacher = clean(attr(node, ["data-teacher"]) || node.querySelector?.("[data-teacher], .teacher")?.textContent || "");
    const homework = clean(attr(node, ["data-homework"]) || node.querySelector?.("[data-homework], .homework")?.textContent || "");
    const note = clean(attr(node, ["data-note"]) || node.querySelector?.("[data-note], .note")?.textContent || "");

    return { id, date, start, end, subject, room, teacher, homework, note };
  }

  function extractLessons() {
    const selectors = [
      "[data-lesson-id]", "[data-skema-id]", "[data-event-id]",
      "[data-start][data-end]", "[data-start-time][data-end-time]",
      ".fc-event", "[class*='lesson-card']", "[class*='lektion']"
    ];
    const nodes = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(node => nodes.add(node));
    }

    const lessons = [];
    const seen = new Set();
    for (const node of nodes) {
      const lesson = extractNode(node);
      if (!lesson) continue;
      const key = `${lesson.id}|${lesson.date}|${lesson.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lessons.push(lesson);
    }
    lessons.sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
    return lessons;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "STUDIESYNC_READ_SCHEDULE") return;
    try {
      const lessons = extractLessons();
      sendResponse({
        ok: lessons.length > 0,
        lessons,
        pageTitle: document.title,
        pageUrl: location.href,
        count: lessons.length,
        error: lessons.length ? null : "Kunne ikke genkende skemalektioner på siden. Studie+ kan have ændret sidens struktur."
      });
    } catch (error) {
      sendResponse({ ok: false, lessons: [], error: String(error?.message || error) });
    }
    return true;
  });
})();
