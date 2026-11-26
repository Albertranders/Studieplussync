# StudieSync

Browserudvidelse, der læser dit skema fra en åben Studie+-session og synkroniserer det til en separat Google Kalender ("Studie+ skema").

## Projektstruktur

- `manifest.json`: browserudvidelsens manifest.
- `src/background.js`, `src/content.js` og `popup/`: browserfunktionalitet og brugerflade.
- `src/auth.js`, `src/sync.js`, `src/settings.js`, `src/config.js` og `src/errors.js`: login, synkronisering, indstillinger og fejlhåndtering.
- `src/gwt.js`: læsning og fortolkning af Studie+'s GWT-kald.
- `tests/`: automatiserede tests.
- `icons/`: udvidelsens ikoner.
- `docs/`: projektdokumentation og interne noter.

## Dokumentation

- [Privatlivspolitik](PRIVACY.md)
- [Chrome Web Store-materiale](docs/CHROME_WEB_STORE.md)
- [Kom godt i gang](docs/GETTING_STARTED.md)
- [Roadmap og opgaveliste](docs/ROADMAP.md)
- [Fejlfinding og diagnosticering](docs/DIAGNOSTICS.md)
- [Ændringslog](CHANGELOG.md)

## Adgang

Udvidelsen er privat, så alle brugere skal godkendes af mig først. Du skal ikke have noget Client ID, det ligger allerede i udvidelsen.

1. Kontakt mig på Discord: **Albertranders**.
2. Send mig den **Gmail**, du vil have skemaet ind på.
3. Når jeg har godkendt den, kan du installere udvidelsen herunder og logge ind med den Gmail.

## Understøttede browsere

Udvidelsen kræver en Chromium-baseret browser, version 116 eller nyere. Den bruger et almindeligt Google-loginvindue, så login virker ens i alle browsere.

| Browser | Status |
|---|---|
| Google Chrome (Windows, macOS, Linux) | Understøttet |
| Opera | Understøttet |
| Microsoft Edge | Understøttet |
| Brave | Burde virke, ikke testet |
| Vivaldi | Burde virke, ikke testet |
| Opera GX | Burde virke, ikke testet |
| Chromium | Burde virke, ikke testet |
| Arc, Yandex Browser m.fl. (Chromium) | Burde virke, ikke testet |
| Firefox og Safari | Virker ikke (andet udvidelsessystem) |
| Mobilbrowsere | Virker ikke |

Er du i tvivl om versionen, kan du slå browserens version op på dens "Om"-side. Chromium-versionen står dér.

## Installation

1. Hent koden: gå til repoet på GitHub, vælg **Code → Download ZIP**, og pak mappen ud.
2. Åbn browserens side med udvidelser:
   - Chrome: `chrome://extensions`
   - Opera: `opera://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Vivaldi: `vivaldi://extensions`
3. Slå **Udviklertilstand** (Developer mode) til.
4. Vælg **Indlæs udpakket** (Load unpacked), og vælg mappen, hvor `manifest.json` ligger.
5. Åbn Studie+ (`all.studieplus.dk`) og log ind.
6. Åbn StudieSync, vælg **Forbind Google Kalender**, og log ind med den Gmail, jeg har godkendt.
7. Vælg **Synkronisér nu**.

Google kan vise "Google har ikke verificeret denne app". Vælg **Avanceret** og derefter **Fortsæt**. Det skyldes, at udvidelsen er privat.

## Menuen

De tre prikker i øverste højre hjørne åbner menuen:

- **Dashboard**: oversigt med forbindelse og seneste synkronisering samt dagens hele skema i en kolonne til højre. Introduktionsguiden åbner automatisk, indtil den er gennemført, og kan åbnes igen under **Indstillinger**.
- **Indstillinger**: antal uger der indlæses, automatisk synkronisering til/fra og hvor ofte, tidszone (vist som fx `(GMT+1) Europe/Copenhagen`), udseende (Automatisk, Lys eller Mørk) og kalenderens navn. **Automatisk** følger browserens lyse eller mørke tema, så popup'en matcher Chrome og Google. Skifter du tidszone, rettes tidspunkterne i kalenderen ved næste synkronisering. Ændringer gemmes med det samme og vinder over `src/config.js`. **Nulstil til config.js** fjerner dine valg igen.
- **Test Studie+ forbindelsen**: tjekker, at udvidelsen kan læse skemaet, uden at røre kalenderen.
- **Skift Google-konto** og **Log ud af Google**: vises, når en konto er forbundet (med den forbundne e-mail øverst). Logud tilbagekalder adgangen hos Google og glemmer login og e-mail i browseren. Kalenderen "Studie+ skema" og dens begivenheder bliver liggende i Google. Forbind en anden konto med **Skift Google-konto**, eller log ud og vælg **Forbind Google Kalender**. Skifter du til en anden konto, oprettes der en ny "Studie+ skema"-kalender dér.

Er ingen konto forbundet, er **Forbind Google Kalender** den store knap i midten. Når en konto er forbundet, bliver den til **Synkronisér nu**.

## Indstillinger (`src/config.js`)

Alle standardindstillinger står i **`src/config.js`**. Åbn filen i en teksteditor, ret, gem, og genindlæs udvidelsen på udvidelsessiden. Der skal ikke køres nogen kommandoer. Du behøver normalt ikke ændre noget.

| Indstilling | Standard | Betydning |
|---|---|---|
| `calendarName` | `Studie+ skema` | Navnet på kalenderen i Google Kalender |
| `timeZone` | browserens tidszone | Tidszone for lektionerne. Kan ændres i menuen Indstillinger |
| `issuesUrl` | `https://github.com/Albertranders/Studieplussync/issues` | Hvor fejlkodernes "Opret issue på GitHub"-link peger hen |
| `autoSyncMinutes` | `30` | Hvor ofte der synkroniseres automatisk (minutter). Kan ændres i menuen Indstillinger |
| `defaultWeeks` | `4` | Antal uger der hentes, før du vælger noget i popup'en |
| `maxWeeks` | `12` | Øvre grænse for antal uger |
| `googleClientId` | (udfyldt) | Avanceret: Google Client ID. Ret kun, hvis du bruger dit eget Google-projekt |
| `studiePlusModule` | `skema` | Avanceret: navn på Studie+'s skema-modul |
| `writeDelayMs` | `200` | Avanceret: pause mellem skrivninger til Google Kalender (pr. parallel skrivning) |
| `openSyncDelayMs` | `3000` | Avanceret: ventetid (ms), før der synkroniseres, når Studie+ åbnes |
| `openSyncMinAgeMinutes` | `5` | Avanceret: der synkroniseres ikke ved åbning, hvis den seneste synkronisering er yngre end dette (minutter) |
| `writeConcurrency` | `3` | Avanceret: antal skrivninger til Google Kalender på samme tid |
| `maxTries` | `6` | Avanceret: antal forsøg pr. Google-kald |

`defaultWeeks`, `autoSyncMinutes` og `calendarName` er startværdier. Det, du vælger i menuen **Indstillinger**, vinder over dem. Ændringer i `src/config.js` gælder, når du har genindlæst udvidelsen.

## Studie+-adresser

Udvidelsen virker på både `all.uddataplus.dk` og `all.studieplus.dk`. Skifter Studie+ adresse igen, skal den nye tilføjes i `manifest.json` (under `host_permissions` og `content_scripts` → `matches`) og i `findStudyPlusTab()` i `src/background.js`.

## Sådan virker det

Forsiden har to faner: **Skema** (dagens lektioner) og **Afleveringer** (de opgaver, du endnu ikke har afleveret, sorteret efter frist). Afleveringerne hentes fra Studie+'s opgaveservice (`src/assignments-parse.js`), kræver kun en åben Studie+-fane og lægges ikke i Google Kalender.

Udvidelsen bruger dit eksisterende login i Studie+. Den beder ikke om adgangskode eller MitID og sender ikke cookies til en ekstern server. Skemaet hentes fra Studie+'s egne serverkald, mens du er logget ind i en åben fane, og lægges i en separat Google Kalender. Du kan bruge **Test Studie+ forbindelsen** i menuen for at tjekke, at udvidelsen kan læse skemaet.

Studie+ har ikke et officielt API, så hentningen bygger på uofficielle serverkald, som Studie+ kan ændre. Hvis skemaet ikke kan læses sikkert, stopper synkroniseringen uden at ændre kalenderen.

Automatisk synkronisering sker, mens browseren kører (se `autoSyncMinutes` og menuen Indstillinger), og når du åbner Studie+: efter et par sekunder synkroniseres skemaet, hvis den seneste synkronisering er mere end 5 minutter gammel. Er du ikke logget ind endnu, springes det stille over. Efter **Log ud af Google** synkroniseres der ikke, før en konto er forbundet igen. Studie+-fanen skal være åben og logget ind.

## Fejlkoder

Når noget går galt, viser udvidelsen en fejlkode, fx **Fejl E301**, og hvad du selv kan gøre for at løse det. Slå koden op herunder for flere detaljer. Løser det ikke problemet, kan du trykke på **Opret issue på GitHub** i popup'en (eller oprette et issue på https://github.com/Albertranders/Studieplussync/issues) og oplyse fejlkoden og den tekniske tekst.

**Google-login og opsætning**

| Kode | Betydning | Hvad kan jeg selv gøre? |
|---|---|---|
| E101 | Google Client ID mangler. | Udvidelsen mangler sit Google Client ID. Hent udvidelsen igen fra GitHub, eller indsæt dit eget Client ID i src/config.js (se README), og genindlæs udvidelsen. |
| E102 | Google-login blev afbrudt eller kunne ikke åbnes. | Prøv at forbinde igen, og gennemfør login i vinduet. |
| E103 | Google afviste login. | Tjek, at din Gmail er godkendt af udvikleren (se Adgang). |
| E104 | Ugyldigt svar fra Google-login. | Prøv at forbinde igen. |
| E105 | Google gav ikke adgang til kalenderen. | Prøv at forbinde igen, og tillad adgangen til Google Kalender. |

**Google Kalender**

| Kode | Betydning | Hvad kan jeg selv gøre? |
|---|---|---|
| E201 | Google afviste adgangen (login udløbet). | Vælg Forbind Google Kalender, og log ind igen. |
| E202 | Google nægtede adgang til kalenderen. | Tjek, at din Gmail er godkendt af udvikleren, og at du har givet tilladelse. |
| E203 | Kalenderen eller en begivenhed blev ikke fundet. | Prøv at synkronisere igen. Kommer fejlen igen, så slet kalenderen "Studie+ skema" i Google Kalender og synkronisér. |
| E204 | Google begrænsede antallet af kald. | Vent et par minutter, og synkronisér igen. |
| E205 | Google Kalender har en serverfejl. | Vent lidt, og prøv igen. |
| E206 | Uventet fejl fra Google Kalender. | Prøv igen om lidt. |
| E207 | Google Tasks har ikke fået tilladelse. | Slå "Læg afleveringer i Google Tasks" fra og til igen i Indstillinger, og giv de tilladelser, der bliver bedt om. |
| E208 | Google Tasks er ikke slået til i udviklerens Google-projekt. | Google Tasks API skal slås til i Google Cloud Console (se README). Prøv igen bagefter. |

**Forbindelse til Studie+**

| Kode | Betydning | Hvad kan jeg selv gøre? |
|---|---|---|
| E301 | Ingen åben Studie+-fane. Åbn Studie+ og log ind. | Åbn Studie+ (all.studieplus.dk eller all.uddataplus.dk), log ind, og prøv igen. |
| E302 | Kan ikke kontakte Studie+-siden. | Genindlæs Studie+-fanen, og prøv igen. |
| E303 | Udvidelsen blev ikke indlæst i Studie+-fanen. | Genindlæs Studie+-fanen, og prøv igen. |
| E304 | Studie+ svarede med en fejl, da siden skulle hentes. | Log ind på Studie+ igen, og prøv igen. |
| E305 | Studie+'s version eller skematjeneste kunne ikke findes. | Studie+ er sandsynligvis opdateret. Genindlæs Studie+-fanen, og prøv igen. |
| E306 | Studie+ afviste skemakaldet (ikke logget ind). | Log ind på Studie+ igen i fanen, og prøv igen. |
| E307 | Studie+ svarede med en fejl på skemakaldet. | Prøv igen lidt senere. |

**Tolkning af Studie+-data**

| Kode | Betydning | Hvad kan jeg selv gøre? |
|---|---|---|
| E401 | Studie+ svarede i et uventet format. | Studie+ er sandsynligvis opdateret. Genindlæs Studie+-fanen, og prøv igen. |
| E402 | Studie+-dataene var beskadigede eller ufuldstændige. | Prøv igen. |
| E403 | Studie+ sendte en ukendt datatype. | Studie+ er sandsynligvis opdateret. Genindlæs Studie+-fanen, og prøv igen. |
| E404 | Skemaet indeholdt en ugyldig lektion. | Genindlæs Studie+-fanen, og prøv igen. Fejlen skyldes en lektion uden dato eller tid i skemaet. Skriv i dit issue, hvilken dag den ligger på. |
| E405 | Studie+ svarede med en serverfejl. | Log ind på Studie+ igen, og prøv igen. |
| E406 | Studie+ returnerede ingen lektioner for perioden. | Tjek, at du har lektioner i perioden, eller vælg flere uger i udvidelsen. |
| E407 | Afleveringerne havde et uventet format. | Studie+ er sandsynligvis opdateret. Genindlæs Studie+-fanen, og prøv igen. Kommer fejlen igen, så kontakt udvikleren. |

**Beskyttelse af kalenderen**

| Kode | Betydning | Hvad kan jeg selv gøre? |
|---|---|---|
| E501 | Skemaet kunne ikke valideres. Kalenderen er ikke ændret. | Prøv igen. Genindlæs evt. Studie+-fanen først. |
| E502 | Studie+ viste markant færre lektioner end kalenderen. Synkroniseringen blev stoppet for at beskytte kalenderen. | Genindlæs Studie+, og prøv igen. |

**Andet**

| Kode | Betydning | Hvad kan jeg selv gøre? |
|---|---|---|
| E901 | Netværksfejl. Kunne ikke oprette forbindelse. | Tjek din internetforbindelse, og prøv igen. |
| E999 | Ukendt fejl. | Genindlæs Studie+-fanen, og prøv igen. |

Kalenderen bliver aldrig ændret, når en fejl i E3xx, E4xx eller E5xx stopper en synkronisering.

## Google Tasks (valgfrit)

Under **Indstillinger → Google Tasks** kan du lægge de afleveringer, du mangler, i Google Tasks. Det er slået fra som standard.

- Udvidelsen opretter listen **Studie+ afleveringer** og lægger én opgave pr. aflevering med fag, titel og fristens dato. Klokkeslættet står i opgavens noter, fordi Google Tasks kun gemmer datoen.
- Opgaverne opdateres, når fristen flyttes, og **afsluttes** (slettes ikke), når afleveringen ikke længere mangler.
- En opgave, du selv har afsluttet, bliver ikke genåbnet, og en opgave, du selv har slettet, bliver ikke oprettet igen. Dine andre lister og opgaver bliver aldrig rørt.
- Slår du det fra, bliver de opgaver, der allerede er oprettet, liggende.
- Første gang bedes der om en ekstra Google-tilladelse. Google har ikke et smallere scope til Tasks end `tasks`, som giver adgang til alle dine opgaver. Udvidelsen bruger kun sin egen liste.

**Opsætning i Google Cloud Console** (kun hvis du bruger dit eget Google-projekt, se `googleClientId` i `src/config.js`):
1. Gå til **APIs og tjenester → Bibliotek**, søg efter **Google Tasks API**, og tryk **Aktivér**. Uden det giver Google fejlen E208.
2. Gå til **Google Auth Platform → Dataadgang** (tidligere *OAuth-samtykkeskærm → Scopes*), tilføj scopet `https://www.googleapis.com/auth/tasks`, og gem.
3. Står appen i *Testing*, skal hver bruger stå som testbruger. Er den udgivet, skal Google godkende scopet, fordi det er et følsomt scope.

## Google-adgang og privatliv

Udvidelsen bruger adgangen `calendar.app.created`, så den kun administrerer sin egen "Studie+ skema"-kalender og ikke dine andre kalendere. `openid` og `email` bruges kun til at huske, hvilken konto du loggede ind med, så Google kan forny adgangen stille i baggrunden. Du kan altid tilbagekalde adgangen med **Log ud af Google** i menuen eller på https://myaccount.google.com/permissions. Læs mere i [privatlivspolitikken](PRIVACY.md).

Privat deling fjerner ikke Googles OAuth-krav. Uverificerede apps kan vise en advarsel eller være underlagt brugerbegrænsninger: https://support.google.com/cloud/answer/13464323
