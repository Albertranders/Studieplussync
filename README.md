# StudieSync

Chrome-udvidelse, der læser skemaet fra en allerede åben Studie+-session og synkroniserer det til en separat Google Kalender.

## Adgang

For at få adgang skal du have et **Client ID** af mig. Du får det ved at kontakte mig på Discord: **Albertranders**.

Du skal også sende mig dit **Extension ID**. Du finder det på `chrome://extensions`, når udvidelsen er indlæst (se Installation herunder).

## Installation

1. Åbn `chrome://extensions`.
2. Aktivér Udviklertilstand.
3. Vælg **Indlæs udpakket**.
4. Vælg denne repositories rodmappe, hvor `manifest.json` ligger.
5. Kopiér udvidelsens **Extension ID** fra `chrome://extensions` og send det til mig på Discord (**Albertranders**).
6. Indsæt det Client ID, du får af mig, i `manifest.json` under `oauth2.client_id`, og genindlæs udvidelsen.
7. Åbn Studie+ og log ind.
8. Åbn StudieSync, forbind Google Kalender, og vælg **Synkronisér nu**.

## Google OAuth

Udvidelsen bruger det Client ID, du får af mig (se Adgang). Den bruger kun `calendar.app.created`, så den administrerer sin egen Studie+-kalender og ikke dine andre kalendere.

Privat deling fjerner ikke Googles OAuth-krav. Uverificerede apps kan vise en advarsel eller være underlagt brugerbegrænsninger. Se Googles aktuelle krav:
https://support.google.com/cloud/answer/13464323

## Studie+-adgang og begrænsninger

Udvidelsen bruger brugerens eksisterende login i Studie+. Den beder ikke om adgangskode eller MitID og sender ikke cookies til en ekstern server.

Skemalæseren er en første DOM-adapter. Den skal valideres mod Studie+ i en rigtig browser, da Studie+ kan ændre sin HTML. Hvis skemaet ikke kan læses sikkert, stopper synkroniseringen uden at ændre kalenderen.

Automatisk synkronisering forsøges hvert 30. minut, mens Chrome kører. Studie+-fanen skal være åben og logget ind.

## Test

```bash
npm test
```

Udvidelsen indlæses direkte fra repositoryets rodmappe. Der er ingen separat extension-mappe.
