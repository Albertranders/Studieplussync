import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import "../config.js";
import "../errors.js";

const { CODES, describe, toStatus } = globalThis.STUDIESYNC_ERRORS;

test("koden overlever som tekst og findes igen", () => {
  const error = new globalThis.StudySyncError("E301");
  assert.equal(describe(error).code, "E301");
  assert.equal(describe(new Error(error.message)).code, "E301");
});

test("status indeholder fejlkode og 'Kontakt udvikleren'", () => {
  const status = toStatus(new globalThis.StudySyncError("E401", "Ugyldigt GWT-svar."));
  assert.equal(status.ok, false);
  assert.equal(status.code, "E401");
  assert.match(status.message, /^Fejl E401: /);
  assert.match(status.detail, /Kontakt udvikleren/);
  assert.match(status.detail, /Ugyldigt GWT-svar\./);
});

test("fejl uden kode bliver E999, netværksfejl bliver E901", () => {
  assert.equal(describe(new Error("noget andet")).code, "E999");
  assert.equal(describe(new TypeError("Failed to fetch")).code, "E901");
  assert.equal(describe(new Error("[E777] findes ikke")).code, "E999");
});

test("alle koder står i README-tabellen, og README har ingen ukendte koder", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const inTable = [...readme.matchAll(/^\| (E\d{3}) \|/gm)].map(match => match[1]);
  assert.deepEqual(inTable.sort(), Object.keys(CODES).sort());
});

test("alle koder, der bruges i koden, findes i tabellen", () => {
  const files = readdirSync(new URL("..", import.meta.url)).filter(name => name.endsWith(".js") && name !== "errors.js");
  for (const name of files) {
    const text = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    for (const [, code] of text.matchAll(/"(E\d{3})"/g)) {
      assert.ok(CODES[code], `${name} bruger ukendt fejlkode ${code}`);
    }
  }
});
