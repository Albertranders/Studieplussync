// Google Tasks: ren logik, der afgør, hvad der skal oprettes, opdateres og afsluttes. Ingen browser-API'er (kan testes).
// Udvidelsen bruger sin egen opgaveliste og rører aldrig andre lister. En opgave genkendes på en markør i
// noterne ("[StudieSync:nøgle]"), fordi Google Tasks ikke har skjulte felter.

export const TASKS_LIST_TITLE = "Studie+ afleveringer";
export const TASKS_API = "https://tasks.googleapis.com/tasks/v1";
const MARKER = /\[StudieSync:([a-z0-9]+)\]/;
const MAX_KNOWN = 500;

// Kort, stabil nøgle for en aflevering (FNV-1a over fag, titel og startdato). Fristen indgår ikke,
// så en flyttet frist opdaterer den eksisterende opgave i stedet for at oprette en ny.
export function assignmentKey(item) {
  const text = [item.subject || "", item.title || "", item.start || ""].join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// Fristens dato ("ÅÅÅÅ-MM-DD") i brugerens tidszone. Google Tasks gemmer kun datoen, ikke klokkeslættet.
export function dueDate(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(iso));
  const get = type => parts.find(part => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// "søndag 6. december 2026 kl. 22.00" i brugerens tidszone.
export function formatDeadline(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("da-DK", {
    timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(iso));
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("weekday")} ${get("day")}. ${get("month")} ${get("year")} kl. ${get("hour")}.${get("minute")}`;
}

// Indholdet af opgaven i Google Tasks.
export function taskBody(item, timeZone) {
  const title = (item.subject ? `${item.subject}: ${item.title}` : item.title).slice(0, 500);
  const notes = [`Frist: ${formatDeadline(item.due, timeZone)}`, "Fra Studie+ (StudieSync)", `[StudieSync:${assignmentKey(item)}]`].join("\n");
  return { title, notes, due: `${dueDate(item.due, timeZone)}T00:00:00.000Z` };
}

// Google kan ændre linjeskift og afsluttende mellemrum i noterne; det må ikke give en opdatering ved hver synkronisering.
const normalize = text => String(text ?? "").replace(/\r\n/g, "\n").trim();

export const keyFromNotes = notes => (typeof notes === "string" ? notes.match(MARKER)?.[1] : undefined) || null;

// Lægger nye nøgler til de kendte (nøgle -> opgave-id) og beholder højst MAX_KNOWN, de nyeste først i ophold.
export function rememberKeys(known, created) {
  const merged = { ...(known || {}) };
  for (const [key, id] of Object.entries(created || {})) { delete merged[key]; merged[key] = id; }
  const keys = Object.keys(merged);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_KNOWN))) delete merged[key];
  return merged;
}

// Sammenligner de uafleverede afleveringer med opgaverne i vores liste.
// - `open`: afleveringer, der endnu ikke er afleveret (med fag, titel, frist og start)
// - `existing`: opgaverne i vores liste (fra Google), også afsluttede
// - `known`: nøgler, vi tidligere har oprettet (nøgle -> opgave-id). En kendt nøgle uden opgave i listen betyder,
//   at brugeren har slettet opgaven, og så oprettes den ikke igen.
// Regler: en afsluttet opgave genåbnes aldrig; opgaver uden markør røres aldrig; en opgave, hvis aflevering
// ikke længere er åben (afleveret), afsluttes (slettes ikke).
export function planTasks({ open, existing, known = {}, timeZone }) {
  const plan = { create: [], update: [], complete: [], skipped: 0, unchanged: 0 };
  const byKey = new Map();
  const duplicates = [];
  for (const task of existing || []) {
    const key = keyFromNotes(task.notes);
    if (!key) continue; // ikke vores
    if (byKey.has(key)) { if (task.status !== "completed") duplicates.push(task); continue; }
    byKey.set(key, task);
  }
  const wanted = new Set();
  for (const item of open || []) {
    const key = assignmentKey(item);
    if (wanted.has(key)) continue; // to ens afleveringer giver én opgave
    wanted.add(key);
    const body = taskBody(item, timeZone);
    const task = byKey.get(key);
    if (!task) {
      if (known[key]) plan.skipped++; // brugeren har slettet den
      else plan.create.push({ key, body });
    } else if (task.status === "completed") {
      plan.unchanged++; // brugeren har selv afsluttet den
    } else if (normalize(task.title) !== normalize(body.title) || normalize(task.notes) !== normalize(body.notes) || String(task.due || "").slice(0, 10) !== body.due.slice(0, 10)) {
      plan.update.push({ id: task.id, key, body });
    } else {
      plan.unchanged++;
    }
  }
  for (const [key, task] of byKey) if (!wanted.has(key) && task.status !== "completed") plan.complete.push({ id: task.id, key });
  for (const task of duplicates) plan.complete.push({ id: task.id, key: keyFromNotes(task.notes) });
  return plan;
}
