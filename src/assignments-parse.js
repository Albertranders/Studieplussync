// Læser svaret fra Studie+'s opgaveservice (getAlleAfleveringer) og finder de afleveringer, der
// IKKE er afleveret endnu. Klassisk script (ikke ES-modul), fordi det indlæses som content script;
// det lægger sig på globalThis, så tests kan bruge det uden browser.
//
// Svaret er en GWT-strøm: [...tal (læses bagfra), strengtabel, flags, version]. Feltrækkefølgen for
// opgavetyperne er ikke dokumenteret, så i stedet for at afkode hver type genkender vi hver aflevering
// på dens faste start og læser kun det, vi skal bruge. Alt uventet stopper med fejlen E407.
// Er antallet af fundne afleveringer ikke lig med listens antal, gættes der ikke.
(() => {
  "use strict";

  const fail = detail => new StudySyncError("E407", detail);
  const MAX_ITEMS = 10000;

  // Indeks (1-baseret) for en Java-type i strengtabellen, fx "dk.uddata.model.opgave.Aflevering".
  const typeIndex = (strings, name) => strings.findIndex(s => typeof s === "string" && s.startsWith(name + "/")) + 1;
  const isTypeName = s => /^[\w$.]+\/\d+$/.test(s);

  function parseAssignments(decoded) {
    if (!Array.isArray(decoded) || decoded.length < 4 || !Array.isArray(decoded.at(-3))) throw fail("Svaret havde ikke strengtabel og data.");
    const strings = decoded.at(-3);
    const r = decoded.slice(0, -3).reverse(); // læserækkefølge: første værdi først
    const LIST = typeIndex(strings, "java.util.ArrayList");
    const ITEM = typeIndex(strings, "dk.uddata.model.opgave.Aflevering");
    const GRADE = typeIndex(strings, "dk.uddata.model.opgave.AfleveringBedoemmelse");
    const DATE = typeIndex(strings, "dk.uddata.gwt.comm.shared.UDate");
    if (!LIST || !DATE) throw fail("Svaret mangler de forventede datatyper.");
    if (r[0] !== LIST) throw fail("Svaret er ikke en liste.");
    const count = Number(r[1]);
    if (!Number.isInteger(count) || count < 0 || count > MAX_ITEMS) throw fail("Ugyldigt antal afleveringer.");
    if (count === 0) return [];
    if (!ITEM || !GRADE) throw fail("Svaret mangler typen Aflevering.");

    // En dato er markøren for UDate, et ignoreret felt og år (fra 1900), måned, dag, time, minut, sekund.
    const isDate = i => r[i] === DATE && Number.isInteger(r[i + 2]) && r[i + 2] >= 100 && r[i + 2] <= 200 &&
      r[i + 3] >= 0 && r[i + 3] <= 11 && r[i + 4] >= 1 && r[i + 4] <= 31 &&
      r[i + 5] >= 0 && r[i + 5] <= 23 && r[i + 6] >= 0 && r[i + 6] <= 59 && r[i + 7] >= 0 && r[i + 7] <= 59;
    const toDate = i => new Date(r[i + 2] + 1900, r[i + 3], r[i + 4], r[i + 5], r[i + 6], r[i + 7]);

    // Hver aflevering starter med typen, så enten et afleveringstidspunkt (afleveret) eller 0 (ikke afleveret),
    // og dernæst typen for bedømmelsen.
    const starts = [];
    for (let i = 2; i < r.length - 10; i++) {
      if (r[i] !== ITEM) continue;
      if ((isDate(i + 1) && r[i + 9] === GRADE) || (r[i + 1] === 0 && r[i + 2] === GRADE)) starts.push(i);
    }
    if (starts.length !== count) throw fail(`Forventede ${count} afleveringer, men fandt ${starts.length}.`);

    const text = v => Number.isInteger(v) && v > 0 && v <= strings.length && typeof strings[v - 1] === "string" &&
      strings[v - 1].length >= 2 && !isTypeName(strings[v - 1]) && !strings[v - 1].startsWith("UDate:") ? strings[v - 1] : null;

    const open = [];
    starts.forEach((start, k) => {
      const end = k + 1 < starts.length ? starts[k + 1] : r.length - 1;
      if (r[start + 1] !== 0) return; // afleveret
      const dates = [];
      for (let i = start; i < end; i++) if (isDate(i)) { dates.push(toDate(i)); i += 7; }
      if (dates.length !== 2) return; // ikke-afleveret har præcis to datoer: frist og start
      // Fag og titel er de to sidste tekster i posten (uden for datoerne).
      const found = [];
      for (let i = end - 1; i > start && found.length < 2; i--) {
        if (r[i - 7] === DATE && isDate(i - 7)) { i -= 7; continue; }
        const t = text(r[i]);
        if (t) found.push(t);
      }
      if (found.length < 2) throw fail("En aflevering manglede fag eller titel.");
      const [title, subject] = found;
      const due = dates[0], from = dates[1];
      if (Number.isNaN(due.getTime()) || Number.isNaN(from.getTime())) throw fail("En aflevering havde en ugyldig dato.");
      open.push({
        id: [due.toISOString(), subject, title].join("|"),
        subject, title, due: due.toISOString(), start: from.toISOString(), submitted: false
      });
    });
    return open;
  }

  globalThis.StudySyncAssignmentsParser = { parseAssignments };
})();
