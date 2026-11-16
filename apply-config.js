// Kopierer chromeClientId fra config.js ind i manifest.json (Chrome kræver det dér).
// Brug:  node apply-config.js
import { readFileSync, writeFileSync } from "node:fs";
import "./config.js";

const config = globalThis.STUDIESYNC_CONFIG;
const manifestPath = new URL("./manifest.json", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

manifest.oauth2 = manifest.oauth2 || {};
manifest.oauth2.client_id = config.chromeClientId;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log("manifest.json opdateret: oauth2.client_id =", config.chromeClientId);
if (config.chromeClientId.startsWith("INSERT")) {
  console.warn("ADVARSEL: chromeClientId i config.js er stadig pladsholderen.");
}
if (config.webClientId.startsWith("INSERT")) {
  console.warn("Bemærk: webClientId er ikke udfyldt (kun nødvendigt til Opera/Edge).");
}
