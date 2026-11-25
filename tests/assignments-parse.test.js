import test from "node:test";
import assert from "node:assert/strict";
import "../src/config.js";
import "../src/errors.js";
import "../src/assignments-parse.js";

const { parseAssignments } = globalThis.StudySyncAssignmentsParser;

// Opdigtet GWT-svar med samme opbygning som Studie+'s opgaveservice (ingen rigtige data).
const LIST = 1, ITEM = 2, DATE = 3, GRADE = 5, STATUS = 6;
const strings = [
  "java.util.ArrayList/4159755760", "dk.uddata.model.opgave.Aflevering/2377986334",
  "dk.uddata.gwt.comm.shared.UDate/2314285719", "UDate:",
  "dk.uddata.model.opgave.AfleveringBedoemmelse/2931321670", "dk.uddata.model.opgave.AfleveringStatus/3020807409",
  "Fysik", "Fysik forsøg", "Dansk", "Rapport", "UP, el", "Kort status på projekt 2", "Kemi", "Gammel journal"
];
const S = text => strings.indexOf(text) + 1;
// Dato i læserækkefølge: markør, ignoreret felt, år (fra 1900), måned (fra 0), dag, time, minut, sekund.
const date = (y, m, d, h, mi) => [DATE, 4, y - 1900, m - 1, d, h, mi, 0];
// Uafleveret: 0 i stedet for afleveringstidspunkt, og to datoer (frist og start).
const open = (subject, title, due, start) =>
  [ITEM, 0, GRADE, 0, 0, 0, ...date(...due), 0, 0, ...date(...start), 0, S(subject), LIST, S(title), 0, 0, 0, 0, STATUS, 0, 0];
// Afleveret: afleveringstidspunkt først og to datoer mere (frist, start) samt bedømmelsesdato.
const done = (subject, title) =>
  [ITEM, ...date(2026, 10, 9, 18, 30), GRADE, 0, 0, ...date(2026, 11, 19, 21, 38), 0, ...date(2026, 10, 9, 23, 55), ...date(2026, 10, 5, 14, 40), 0, S(subject), LIST, S(title), 0, 0, STATUS, 0];
const response = (items, count = items.length) => {
  const read = [LIST, count, ...items.flat()];
  return [...read.reverse(), strings, 0, 7];
};

test("kun uafleverede afleveringer returneres, med fag, titel, frist og start", () => {
  const decoded = response([
    open("Fysik", "Fysik forsøg", [2026, 12, 6, 22, 0], [2026, 11, 24, 8, 0]),
    done("Dansk", "Rapport"),
    open("UP, el", "Kort status på projekt 2", [2026, 12, 2, 23, 55], [2026, 11, 23, 13, 35])
  ]);
  const result = parseAssignments(decoded);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(a => [a.subject, a.title]), [["Fysik", "Fysik forsøg"], ["UP, el", "Kort status på projekt 2"]]);
  assert.equal(result[0].due, new Date(2026, 11, 6, 22, 0).toISOString());
  assert.equal(result[0].start, new Date(2026, 10, 24, 8, 0).toISOString());
  assert.equal(result[1].due, new Date(2026, 11, 2, 23, 55).toISOString());
  assert.ok(result.every(a => a.submitted === false && a.id.includes(a.title)));
});

test("en tom liste giver ingen afleveringer", () => {
  assert.deepEqual(parseAssignments(response([])), []);
});

test("forkert antal afleveringer stopper med E407 i stedet for at gætte", () => {
  const decoded = response([done("Dansk", "Rapport"), open("Fysik", "Fysik forsøg", [2026, 12, 6, 22, 0], [2026, 11, 24, 8, 0])], 5);
  assert.throws(() => parseAssignments(decoded), error => error.code === "E407" && /Forventede 5/.test(error.message));
});

test("svar der ikke er en liste, eller mangler strengtabel, afvises", () => {
  const notList = response([]); notList[notList.length - 4] = ITEM; // roden er ikke en liste
  assert.throws(() => parseAssignments(notList), error => error.code === "E407");
  assert.throws(() => parseAssignments([1, 2, 3]), error => error.code === "E407");
  assert.throws(() => parseAssignments(null), error => error.code === "E407");
});

test("en ikke-afleveret post med tre datoer regnes ikke som åben", () => {
  const odd = [ITEM, 0, GRADE, 0, ...date(2025, 2, 28, 7, 15), 0, ...date(2025, 2, 28, 8, 0), ...date(2025, 2, 28, 7, 14), 0, S("Kemi"), LIST, S("Gammel journal"), 0, 0, 0, 0, STATUS, 0, 0];
  assert.deepEqual(parseAssignments(response([odd, open("Fysik", "Fysik forsøg", [2026, 12, 6, 22, 0], [2026, 11, 24, 8, 0])])).map(a => a.title), ["Fysik forsøg"]);
});
