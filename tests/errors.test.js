import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import "../src/config.js";
import "../src/errors.js";
const { CODES, describe, toStatus } = globalThis.STUDIESYNC_ERRORS;
// Keep runtime error mapping and the README error-code table consistent.
test("koden overlever som tekst og findes igen",()=>{const error=new globalThis.StudySyncError("E301");assert.equal(describe(error).code,"E301");assert.equal(describe(new Error(error.message)).code,"E301");});
test("status beskriver løsningen, nævner GitHub-issues og indeholder fejlkode og teknisk tekst",()=>{
  const status=toStatus(new globalThis.StudySyncError("E401","Ugyldigt GWT-svar."));
  assert.equal(status.ok,false);assert.equal(status.code,"E401");
  assert.match(status.message,/^Fejl E401: /);
  assert.ok(status.detail.startsWith(CODES.E401.fix),"detail starter med løsningen");
  assert.match(status.detail,/opret et issue på GitHub/);
  assert.match(status.detail,/Ugyldigt GWT-svar\./);
  assert.doesNotMatch(status.detail,/Kontakt udvikleren/i);
});
test("ingen fejlkode beder brugeren kontakte udvikleren",()=>{for(const [code,{fix}] of Object.entries(CODES))assert.doesNotMatch(fix,/kontakt udvikleren/i,code);});
test("issue-linket peger på repoets issues og har fejlkode, tekst og version udfyldt",()=>{
  const url=new URL(toStatus(new globalThis.StudySyncError("E306","HTTP 401")).issueUrl);
  assert.equal(url.origin+url.pathname,"https://github.com/Albertranders/Studieplussync/issues/new");
  assert.match(url.searchParams.get("title"),/^Fejl E306: /);
  const body=url.searchParams.get("body");
  assert.match(body,/\*\*Fejlkode:\*\* E306/);assert.match(body,/HTTP 401/);assert.match(body,/StudieSync-version/);
});
test("fejl uden kode bliver E999, netværksfejl bliver E901",()=>{assert.equal(describe(new Error("noget andet")).code,"E999");assert.equal(describe(new TypeError("Failed to fetch")).code,"E901");assert.equal(describe(new Error("[E777] findes ikke")).code,"E999");});
test("alle koder står i README-tabellen",()=>{const readme=readFileSync(new URL("../README.md",import.meta.url),"utf8");const inTable=[...readme.matchAll(/^\| (E\d{3}) \|/gm)].map(m=>m[1]);assert.deepEqual(inTable.sort(),Object.keys(CODES).sort());});
test("alle koder brugt i runtime findes i tabellen",()=>{const files=readdirSync(new URL("../src/",import.meta.url)).filter(n=>n.endsWith(".js")&&n!=="errors.js");for(const name of files){const source=readFileSync(new URL(`../src/${name}`,import.meta.url),"utf8");for(const [,code] of source.matchAll(/"(E\d{3})"/g))assert.ok(CODES[code],`${name} bruger ukendt fejlkode ${code}`);}});
