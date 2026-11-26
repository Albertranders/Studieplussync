// Afleveringer: lokal kopi og sortering til fanen "Afleveringer". Ren logik uden browser-API'er (kan testes).
// En aflevering har: id, fag, titel, frist (ISO-tidspunkt) og om den er afleveret.

const MAX_ASSIGNMENTS = 300;

// Gem kun det, fanen skal bruge. Ugyldige poster (uden id, titel eller gyldig frist) sorteres fra.
// Uafleverede opgaver med en frist, der er mere end `maxOverdueDays` dage gammel, droppes: Studie+ viser dem
// heller ikke længere, og ellers ville gamle, aldrig afleverede opgaver stå i listen for evigt.
export const MAX_OVERDUE_DAYS = 30;
export function buildAssignmentsCache(items, now = new Date(), maxOverdueDays = MAX_OVERDUE_DAYS) {
  const seen = new Set();
  const assignments = [];
  const oldest = now.getTime() - maxOverdueDays * 24 * 60 * 60 * 1000;
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.id == null || !item.title) continue;
    const due = new Date(item.due);
    if (Number.isNaN(due.getTime())) continue;
    if (item.submitted !== true && due.getTime() < oldest) continue;
    const id = String(item.id);
    if (seen.has(id)) continue;
    seen.add(id);
    assignments.push({
      id,
      subject: String(item.subject || "").slice(0, 120),
      title: String(item.title).slice(0, 200),
      due: due.toISOString(),
      ...(Number.isNaN(new Date(item.start).getTime()) ? {} : { start: new Date(item.start).toISOString() }),
      submitted: item.submitted === true
    });
    if (assignments.length >= MAX_ASSIGNMENTS) break;
  }
  return { at: now.toISOString(), assignments };
}

// Tilstand ud fra fristen: "done", "overdue" (fristen er passeret), "today" (frist i dag) eller "upcoming".
export function assignmentState(item, now = new Date()) {
  if (item.submitted) return "done";
  const due = new Date(item.due);
  if (due.getTime() < now.getTime()) return "overdue";
  const endOfToday = new Date(now);
  endOfToday.setHours(24, 0, 0, 0);
  return due.getTime() < endOfToday.getTime() ? "today" : "upcoming";
}

// Returnerer null, hvis der ikke findes en brugbar kopi (så kan fanen vise en forklaring).
// Ellers: åbne afleveringer først (tidligste frist øverst), afleverede til sidst (nyeste først).
export function sortedAssignments(cache, now = new Date()) {
  if (!cache || !Array.isArray(cache.assignments)) return null;
  const withState = cache.assignments.map(item => ({ ...item, state: assignmentState(item, now) }));
  const open = withState.filter(item => item.state !== "done").sort((a, b) => a.due.localeCompare(b.due));
  const done = withState.filter(item => item.state === "done").sort((a, b) => b.due.localeCompare(a.due));
  return [...open, ...done];
}

// Antal åbne afleveringer, der kræver handling (frist passeret eller kommende).
export function openCount(cache) {
  return Array.isArray(cache?.assignments) ? cache.assignments.filter(item => !item.submitted).length : 0;
}

// Hvilken fane der vises på forsiden. Ukendte værdier giver "schedule".
export const DASHBOARD_TABS = ["schedule", "assignments"];
export function resolveTab(value) {
  return DASHBOARD_TABS.includes(value) ? value : "schedule";
}
