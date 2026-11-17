// Beskytter mod fejl som "Uncaught SyntaxError: Unexpected token '}'" i popup'en.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const srcDir = fileURLToPath(new URL("src/", root));

test("alle JavaScript-filer i src/ kan parses", () => {
  for (const name of readdirSync(srcDir).filter(file => file.endsWith(".js"))) {
    const result = spawnSync(process.execPath, ["--check", srcDir + name], { encoding: "utf8" });
    assert.equal(result.status, 0, `${name} har en syntaksfejl:\n${result.stderr}`);
  }
});

test("alle element-id'er, popup.js slår op, findes i popup/index.html", () => {
  const js = readFileSync(new URL("src/popup.js", root), "utf8");
  const html = readFileSync(new URL("popup/index.html", root), "utf8");
  const used = new Set([...js.matchAll(/\$\("([\w-]+)"\)/g)].map(match => match[1]));
  const defined = new Set([...html.matchAll(/\sid="([\w-]+)"/g)].map(match => match[1]));
  const missing = [...used].filter(id => !defined.has(id));
  assert.deepEqual(missing, [], `Mangler i index.html: ${missing.join(", ")}`);
});

test("popup/index.html har ingen dublerede id'er", () => {
  const html = readFileSync(new URL("popup/index.html", root), "utf8");
  const ids = [...html.matchAll(/\sid="([\w-]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test("popup.css har balancerede klammer", () => {
  const css = readFileSync(new URL("popup/popup.css", root), "utf8");
  let depth = 0;
  for (const char of css) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    assert.ok(depth >= 0, "Overskydende } i popup.css");
  }
  assert.equal(depth, 0, "Manglende } i popup.css");
});
