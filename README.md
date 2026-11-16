# StudieSync

Browserudvidelse, der læser dit skema fra en åben Studie+-session og synkroniserer det til en separat Google Kalender ("Studie+ skema").

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

## Indstillinger (`config.js`)

Alle indstillinger står i **`config.js`**. Åbn filen i en teksteditor, ret, gem, og genindlæs udvidelsen på udvidelsessiden. Der skal ikke køres nogen kommandoer. Du behøver normalt ikke ændre noget.

| Indstilling | Standard | Betydning |
|---|---|---|
| `calendarName` | `Studie+ skema` | Navnet på kalenderen i Google Kalender |
| `timeZone` | `Europe/Copenhagen` | Tidszone for lektionerne |
| `autoSyncMinutes` | `30` | Hvor ofte der synkroniseres automatisk (minutter). Teksten i popup'en følger denne værdi |
| `defaultWeeks` | `4` | Antal uger der hentes, før du vælger noget i popup'en |
| `maxWeeks` | `12` | Øvre grænse for antal uger |
| `googleClientId` | (udfyldt) | Avanceret: Google Client ID. Ret kun, hvis du bruger dit eget Google-projekt |
| `studiePlusModule` | `skema` | Avanceret: navn på Studie+'s skema-modul |
| `writeDelayMs` | `300` | Avanceret: pause mellem skrivninger til Google Kalender |
| `maxTries` | `6` | Avanceret: antal forsøg pr. Google-kald |

Ændringen af `autoSyncMinutes` gælder først, når udvidelsen er fjernet og indlæst igen.

## Studie+-adresser

Udvidelsen virker på både `all.uddataplus.dk` og `all.studieplus.dk`. Skifter Studie+ adresse igen, skal den nye tilføjes i `manifest.json` (under `host_permissions` og `content_scripts` → `matches`) og i `findStudyPlusTab()` i `background.js`.

## Sådan virker det

Udvidelsen bruger dit eksisterende login i Studie+. Den beder ikke om adgangskode eller MitID og sender ikke cookies til en ekstern server. Skemaet hentes fra Studie+'s egne serverkald, mens du er logget ind i en åben fane, og lægges i en separat Google Kalender. Du kan bruge knappen **Test Studie+ forbindelsen** for at tjekke, at udvidelsen kan læse skemaet.

Studie+ har ikke et officielt API, så hentningen bygger på uofficielle serverkald, som Studie+ kan ændre. Hvis skemaet ikke kan læses sikkert, stopper synkroniseringen uden at ændre kalenderen.

Automatisk synkronisering sker, mens browseren kører (se `autoSyncMinutes`). Studie+-fanen skal være åben og logget ind.

## Google-adgang og privatliv

Udvidelsen bruger kun adgangen `calendar.app.created`, så den kun administrerer sin egen "Studie+ skema"-kalender og ikke dine andre kalendere. Du kan altid tilbagekalde adgangen på https://myaccount.google.com/permissions. Læs mere i `PRIVACY.md`.

Privat deling fjerner ikke Googles OAuth-krav. Uverificerede apps kan vise en advarsel eller være underlagt brugerbegrænsninger: https://support.google.com/cloud/answer/13464323
