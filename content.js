(() => {
  "use strict";

  const DAY_NAMES = {
    man: 1, tir: 2, ons: 3, tor: 4, fre: 5, "lør": 6, "søn": 0
  };

  function referenceDate() {
    const match = location.href.match(/(20\\d{2})-(\\d{1,2})-(\\d{1,2})/);
    if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  function dateFromHeader(label, reference) {
    const match = label.trim().match(/^(man|tir|ons|tor|fre|lør|søn)\\s+(\\d{1,2})\\/(\\d{1,2})$/i);
    if (!match) return "";
    const weekday = DAY_NAMES[match[1].toLowerCase()];
    const day = Number(match[2]);
    const month = Number(match[3]);
    const candidates = [];

    for (const year of [reference.getUTCFullYear() - 1, reference.getUTCFullYear(), reference.getUTCFullYear() + 1]) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCDate() === day && date.getUTCMonth() === month - 1 && date.getUTCDay() === weekday) {
        candidates.push(date);
      }
    }

    if (!candidates.length) return "";
    candidates.sort((a, b) =>
      Math.abs(a.getTime() - reference.getTime()) - Math.abs(b.getTime() - reference.getTime())
    );
    const chosen = candidates[0];
    return [
      chosen.getUTCFullYear(),
      String(chosen.getUTCMonth() + 1).padStart(2, "0"),
      String(chosen.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function readDateColumns(reference) {
    return [...document.querySelectorAll("th.fc-widget-header")]
      .map(header => {
        const label = header.querySelector(".gwt-Label")?.textContent?.trim() || "";
        const rect = header.getBoundingClientRect();
        const date = dateFromHeader(label, reference);
        if (!date || rect.width <= 0) return null;
        return { date, center: rect.left + rect.width / 2, width: rect.width };
      })
      .filter(Boolean);
  }

  function readSvgText(node) {
    return [...node.querySelectorAll("text")].map(element => ({
      text: (element.textContent || "").replace(/\\s+/g, " ").trim(),
      x: Number(element.getAttribute("x")),
      y: Number(element.getAttribute("y"))
    })).filter(item => item.text);
  }

  function nearestDate(node, columns) {
    const matrix = node.getScreenCTM?.();
    const rect = node.querySelector("rect");
    if (!matrix || !rect || !columns.length) return "";
    const center = matrix.e + Number(rect.getAttribute("x") || 0) +
      Number(rect.getAttribute("width") || 0) / 2;

    let nearest = null;
    for (const column of columns) {
      const distance = Math.abs(center - column.center);
      if (!nearest || distance < nearest.distance) nearest = { column, distance };
    }
    if (!nearest || nearest.distance > Math.max(30, nearest.column.width * 0.4)) return "";
    return nearest.column.date;
  }

  function parseLesson(node, columns) {
    const texts = readSvgText(node);
    const timeText = texts.find(item => /^\\d{1,2}:\\d{2}\\s*-\\s*\\d{1,2}:\\d{2}$/.test(item.text));
    if (!timeText) return null;

    const timeMatch = timeText.text.match(/^(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})$/);
    const subjectText = texts.find(item => item.y === 28 && item.text !== timeText.text) ||
      texts.find(item => item !== timeText && item.y !== 44 && !/^\\d{1,2}:\\d{2}/.test(item.text));
    const date = nearestDate(node, columns);
    if (!date || !subjectText) return null;

    const details = texts.filter(item => item.y === 44);
    const teacher = details.find(item => item.x <= 30)?.text || "";
    const room = details.find(item => item.x > 70)?.text || "";
    const classCode = texts.find(item => item.x < 0 && item.y < 0)?.text || "";
    const subject = subjectText.text;
    const start = timeMatch[1].padStart(5, "0");
    const end = timeMatch[2].padStart(5, "0");

    return {
      id: [date, start, subject, room, teacher, classCode].join("|"),
      date,
      start,
      end,
      subject,
      room,
      teacher,
      homework: "",
      note: ""
    };
  }

  function extractLessons() {
    const reference = referenceDate();
    const columns = readDateColumns(reference);
    if (!columns.length) {
      throw new Error("Kunne ikke finde datooverskrifterne i Studie+ skemaet.");
    }

    const nodes = [...document.querySelectorAll("g.O2HAI5C-h-b")];
    const lessons = [];
    const seen = new Set();

    for (const node of nodes) {
      const lesson = parseLesson(node, columns);
      if (!lesson) continue;
      if (seen.has(lesson.id)) continue;
      seen.add(lesson.id);
      lessons.push(lesson);
    }

    lessons.sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));

    // Reuse the signed-in browser session. Cookie values are never read or copied.
    const dates = [...new Set(lessons.map(lesson => lesson.date))].sort();
    let gwt = { ok: false, error: "Ingen lektioner at hente." };
    if (dates.length && window.StudySyncGwt) {
      try {
        gwt = await window.StudySyncGwt.fetchSchedule(dates[0], dates[dates.length - 1]);
      } catch (error) {
        gwt = { ok: false, error: String(error?.message || error) };
      }
    }
    return { lessons, gwt };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "STUDIESYNC_READ_SCHEDULE") return;
    try {
      extractLessons().then(({ lessons, gwt }) => sendResponse({
        ok: lessons.length > 0,
        lessons,
        gwt,
        pageTitle: document.title,
        pageUrl: location.href,
        count: lessons.length,
        error: lessons.length ? null : "Kunne ikke genkende skemalektioner på siden. Kontrollér, at skemaet er synligt."
      })).catch(error => sendResponse({ ok: false, lessons: [], error: String(error?.message || error) }));
    } catch (error) {
      sendResponse({ ok: false, lessons: [], error: String(error?.message || error) });
    }
    return true;
  });
})();
