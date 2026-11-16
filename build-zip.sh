#!/usr/bin/env bash
# Pakker udvidelsen til upload i Chrome Web Store: ./build-zip.sh
# Stop ved fejl (-e), ved ubrugte variabler (-u) og ved fejl midt i en pipe
set -euo pipefail
# Kør altid fra scriptets egen mappe, uanset hvor det startes fra
cd "$(dirname "$0")"

# Tjek at manifest.json er gyldig JSON, før vi pakker
node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8"))'
# Læs versionsnummeret fra manifestet og lav zip-filens navn ud fra det
VERSION=$(node -p 'require("./manifest.json").version')
OUT="studiesync-$VERSION.zip"
# Fjern en evt. gammel zip med samme navn
rm -f "$OUT"

# Pak kun de filer, udvidelsen skal bruge (ikke tests, README osv.)
zip -r "$OUT" manifest.json config.js errors.js background.js auth.js content.js gwt.js sync.js \
  popup.html popup.css popup.js icons -x "*.DS_Store"

# Advar hvis Client ID stadig er pladsholderen
if grep -q "INSERT CLIENT ID HERE" config.js; then
  echo "ADVARSEL: config.js mangler stadig et Google Client ID (googleClientId)." >&2
fi
echo "Lavet: $OUT"
