import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const manifest=JSON.parse(readFileSync(path.join(root,"manifest.json"),"utf8"));
const required=[manifest.background?.service_worker,manifest.action?.default_popup,...Object.values(manifest.icons||{}),...Object.values(manifest.action?.default_icon||{}),...(manifest.content_scripts||[]).flatMap(s=>s.js||[])].filter(Boolean);
for(const file of required){const resolved=path.resolve(root,file);assert.ok(resolved.startsWith(root+path.sep),`Ugyldig manifeststi: ${file}`);assert.ok(existsSync(resolved),`Manifestfil mangler: ${file}`);}
const popupPath=path.join(root,manifest.action.default_popup),html=readFileSync(popupPath,"utf8");
for(const [,attr] of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(/^(?:https?:|data:|#)/i.test(attr))continue;const resolved=path.resolve(path.dirname(popupPath),attr);assert.ok(resolved.startsWith(root+path.sep));assert.ok(existsSync(resolved),`Popup-fil mangler: ${attr}`);}
const src=path.join(root,"src");
for(const file of ["background.js","auth.js","config.js","content.js","errors.js","gwt.js","popup.js","settings.js","sync.js"]){const full=path.join(src,file);assert.ok(existsSync(full),`Runtime-fil mangler: ${file}`);const text=readFileSync(full,"utf8");for(const [,specifier] of text.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)){const target=path.resolve(src,specifier);assert.ok(target.startsWith(src+path.sep));assert.ok(existsSync(target),`Import mangler: ${file} -> ${specifier}`);}}
console.log("Manifest, popup-stier og runtime-imports er gyldige.");
// Check that manifest entries, popup assets, and runtime imports resolve inside the extension.
