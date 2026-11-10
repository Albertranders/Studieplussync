#!/usr/bin/env bash
# Pakker udvidelsen til upload i Chrome Web Store: ./build-zip.sh
set -euo pipefail
cd "$(dirname "$0")"

node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8"))'
VERSION=$(node -p 'require("./manifest.json").version')
OUT="studiesync-$VERSION.zip"
rm -f "$OUT"

zip -r "$OUT" manifest.json background.js content.js gwt.js sync.js \
  popup.html popup.css popup.js icons -x "*.DS_Store"

if grep -q "INSERT CLIENT ID HERE" manifest.json; then
  echo "ADVARSEL: manifest.json mangler stadig et rigtigt OAuth client_id." >&2
fi
echo "Lavet: $OUT"
