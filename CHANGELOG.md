# Ændringslog

Vigtige ændringer i StudieSync. Nyeste version står øverst.

## Ikke udgivet

### Tilføjet
- Dashboard i popup'en med forbindelsesstatus, seneste synkronisering og versionsnummer.
- Forsiden har to kolonner: til højre ligger overskriften og hele dagens skema (aktuel lektion fremhævet, overståede nedtonede, plads til 7 lektioner uden scroll). Til venstre ligger status, forbindelse, seneste synkronisering og knapper.
- Introduktionsguide med kontrol af hvert trin, og indstillinger opdelt i Synkronisering, Kalender og Udseende.
- Dokumentet `docs/GETTING_STARTED.md`.
- Test, der kontrollerer, at alle JS-filer kan parses, og at popup'ens element-id'er findes i `popup/index.html`.

### Rettet
- Fejlen `Uncaught SyntaxError: Unexpected token '}'` i popup'en.
- `chrome.runtime.lastError` aflæses nu, så konsollen ikke fyldes med "Unchecked runtime.lastError".
- Dashboardet overskriver ikke længere beskeden "Google Kalender er ikke forbundet" og kalder ikke Google, når ingen konto er forbundet.
- Guidens "pause til indstillinger"-tilstand nulstilles, når guiden lukkes eller åbnes igen.
- Ødelagt dokumentationsliste i README.
- Fejlbeskeder fra Studie+ mistede bogstaverne r, n og t på grund af forkert escapede regex i `gwt.js`.
- Lektioner, der aflyses i slutningen af den hentede periode, fjernes nu fra kalenderen.
- Beskeder til Studie+-fanen har nu en timeout på 2 minutter, så synkronisering ikke kan hænge.
- Studie+-versionen slås op igen (ét ekstra forsøg), hvis Studie+ opdateres, mens fanen er åben.

### Fjernet
- Ubrugt SVG-læser i `content.js`, fejlkoden `E407`, funktionen `mondayStart()` og ubrugte CSS-klasser.
- `check-extension.mjs` tjekker nu alle filer i `src/` i stedet for en fast liste.

## 0.2.0

### Ændret
- Samlet browserens JavaScript-filer i `src/`.
- Samlet popupens HTML og CSS i `popup/`.
- Opdateret manifest, imports, tests og ZIP-pakning til den nye projektstruktur.
- Tilføjet automatisk kontrol af manifeststier, popup-referencer og lokale imports.
- Tilføjet GitHub Actions, der kører tests, strukturkontrol og pakning.

### Bemærk
- Synkroniseringslogikken og Google OAuth-flowet blev ikke ændret i denne version.
- Google-login og den rigtige Studie+-integration skal stadig testes manuelt i browseren.
