# StudieSync

Chrome-udvidelse, der læser skemaet fra en allerede åben Studie+-session og synkroniserer det til en separat Google Kalender.

## Opsætning

Alle variable ligger i **`config.js`**: Google Client ID, kalendernavn, tidszone, synkroniseringsinterval og antal uger. Åbn filen, ret, gem og genindlæs udvidelsen. Der skal ikke køres nogen kommando.

## Adgang

For at få adgang skal du have et **Client ID** af mig. Du får det ved at kontakte mig på Discord: **Albertranders**.

Du skal også sende mig:

- dit **Extension ID**. Du finder det på `chrome://extensions` (eller `opera://extensions`), når udvidelsen er indlæst.
- din **Gmail**, som du vil have kalenderbegivenhederne ind på.

## Understøttede browsere

Google Chrome, Opera og Edge (Chromium 116 eller nyere). Alle bruger det samme Google-loginvindue. Brave, Vivaldi og andre Chromium-browsere er ikke testet.

## Installation

1. Åbn `chrome://extensions` (Opera: `opera://extensions`, Edge: `edge://extensions`).
2. Aktivér Udviklertilstand.
3. Vælg **Indlæs udpakket** (Load unpacked), og vælg mappen, hvor `manifest.json` ligger.
4. Kopiér udvidelsens **Extension ID** og send det til mig sammen med din Gmail. Redirect-URI'en bliver `https://<extension-id>.chromiumapp.org/`.
5. Indsæt det Client ID, du får af mig, i `googleClientId` i `config.js`, gem, og genindlæs udvidelsen.
6. Åbn Studie+ og log ind.
7. Åbn StudieSync, forbind Google Kalender, og vælg **Synkronisér nu**.

Opretter du selv Client ID'et: lav en OAuth-klient af typen **Web application** i Google Cloud Console, og tilføj redirect-URI'en fra trin 4 under *Authorized redirect URIs*.

Tip: Sæt en fast `key` i `manifest.json`, så Extension ID (og dermed redirect-URI) ikke ændrer sig, hvis udvidelsen fjernes og indlæses igen.

## Google OAuth

Udvidelsen bruger det Client ID, du får af mig (se Adgang). Den bruger kun `calendar.app.created`, så den administrerer sin egen Studie+-kalender og ikke dine andre kalendere.

Privat deling fjerner ikke Googles OAuth-krav. Uverificerede apps kan vise en advarsel eller være underlagt brugerbegrænsninger. Se Googles aktuelle krav:
https://support.google.com/cloud/answer/13464323

## Studie+-adgang og begrænsninger

Udvidelsen bruger brugerens eksisterende login i Studie+. Den beder ikke om adgangskode eller MitID og sender ikke cookies til en ekstern server.

Skemalæseren er en første DOM-adapter. Den skal valideres mod Studie+ i en rigtig browser, da Studie+ kan ændre sin HTML. Hvis skemaet ikke kan læses sikkert, stopper synkroniseringen uden at ændre kalenderen.

Automatisk synkronisering forsøges hvert 30. minut, mens Chrome kører. Studie+-fanen skal være åben og logget ind.
