# StudieSync

Chrome-udvidelse, der læser skemaet fra en allerede åben Studie+-session og synkroniserer det til en separat Google Kalender.

## Installer til test

1. Åbn `chrome://extensions`.
2. Aktivér Udviklertilstand.
3. Vælg **Indlæs udpakket**.
4. Vælg denne repositories rodmappe, hvor `manifest.json` ligger.
5. Åbn Studie+ og log ind.
6. Åbn StudieSync, forbind Google Kalender, og vælg **Synkronisér nu**.

## Google OAuth

Indsæt et Google OAuth Client ID til Chrome Extension i `manifest.json` under `oauth2.client_id`. Aktivér Google Calendar API i Google Cloud, og konfigurér OAuth consent screen. Udvidelsen bruger kun `calendar.app.created`, så den administrerer sin egen Studie+-kalender.

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
