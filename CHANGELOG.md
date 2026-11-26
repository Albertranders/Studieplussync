# Ændringslog

Vigtige ændringer i StudieSync. Nyeste version står øverst.

## Ikke udgivet

### Ændret (fejlbeskeder)
- Fejlbeskeder beskriver nu, hvad du selv kan gøre, i stedet for at bede dig kontakte udvikleren. Løser det ikke problemet, vises et link, der opretter et GitHub-issue med fejlkode, teknisk tekst og version udfyldt. `developerContact` i `config.js` er erstattet af `issuesUrl`.

### Rettet (udseende)
- Popup'ens højde følger nu indholdet i stedet for en fast mindstehøjde på 540 px, så der ikke er et ubrugt mellemrum i bunden. Lange visninger (fx indstillinger) ruller nu i stedet for at blive klippet ved Chromes grænse på 600 px.

### Hurtigere
- "I dag"-listen i popup'en vises nu øjeblikkeligt. Den læses fra en lokal kopi af det seneste synkroniserede skema i stedet for at spørge Google Kalender (og evt. forny login) hver gang popup'en åbnes.
- Popup'en henter status, konto og historik direkte fra lageret i ét kald uden at vente på baggrundsscriptet, og den dyre tidszoneliste bygges først i ro og mag efter visning.
- Studie+'s version (GWT-permutation og service-hash) gemmes i op til 12 timer, så de to store filer ikke hentes igen ved hver genindlæsning. En forældet kopi opdages og rettes automatisk.
- Synkroniseringen skriver til Google Kalender tre events ad gangen (`writeConcurrency`) med kortere pause, springer et ekstra kalenderopslag over og fornyer Google-login, mens skemaet hentes fra Studie+.

### Tilføjet
- Valgfri Google Tasks: under Indstillinger kan du lægge de afleveringer, du mangler, i en egen liste, "Studie+ afleveringer". Opgaverne opdateres ved ændret frist og afsluttes, når afleveringen ikke længere mangler. En opgave, du selv har afsluttet, genåbnes ikke, og en, du selv har slettet, oprettes ikke igen. Slået fra som standard, og det ekstra Google-scope `tasks` bedes først om, når du slår det til. Nye fejlkoder E207 og E208. Kræver, at Google Tasks API er slået til i Google Cloud Console (se README).
- Fane på forsiden, hvor man kan skifte mellem Skema og Afleveringer. Valget huskes. Afleveringsvisningen sorterer efter frist og markerer forfaldne afleveringer og afleveringer med frist i dag. Fanen viser de afleveringer, du endnu ikke har afleveret (fag, titel og frist), hentet fra Studie+'s opgaveservice. De opdateres efter hver synkronisering og når fanen åbnes. Uafleverede opgaver med en frist, der er mere end 30 dage gammel, vises ikke. Ny fejlkode E407, hvis Studie+ ændrer formatet.
- Synkronisering, når Studie+ åbnes: content-scriptet melder, at siden er indlæst, og udvidelsen synkroniserer efter 3 sekunder, hvis automatisk synkronisering er slået til, Google er forbundet, og den seneste synkronisering er over 5 minutter gammel. Er Studie+ ikke klar eller ikke logget ind, springes det over uden fejlmarkering.
- Dashboard i popup'en med forbindelsesstatus, seneste synkronisering og versionsnummer.
- Forsiden har to kolonner: til højre ligger overskriften og hele dagens skema (aktuel lektion fremhævet, overståede nedtonede, plads til 7 lektioner uden scroll). Til venstre ligger status, forbindelse, seneste synkronisering og knapper, med kortere tekster og mere luft.
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
