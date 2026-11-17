#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8"))'
VERSION=$(node -p 'require("./manifest.json").version')
OUT="studiesync-$VERSION.zip"
rm -f "$OUT"
zip -r "$OUT" manifest.json src popup icons -x "*.DS_Store"
if grep -q "INSERT CLIENT ID HERE" src/config.js; then echo "ADVARSEL: src/config.js mangler Google Client ID." >&2; fi
echo "Lavet: $OUT"
