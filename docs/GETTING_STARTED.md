# Kom godt i gang med StudieSync

StudieSync kopierer dit skema fra en åben Studie+-session til en separat kalender i Google Kalender. Følg trinene her første gang.

## Før du starter

- Brug Google Chrome, Microsoft Edge, Opera eller en anden Chromium-baseret browser, version 116 eller nyere.
- Du skal have adgang til StudieSync. Udvidelsen er privat, og din Google-konto skal godkendes af udvikleren.
- Du skal kunne logge ind på Studie+ i browseren.
- StudieSync skal have adgang til den Google-konto, hvor kalenderen skal oprettes.

Firefox, Safari og mobilbrowsere understøttes ikke.

## 1. Få adgang til udvidelsen

Kontakt udvikleren på Discord: **Albertranders**. Oplys den Gmail-konto, du vil bruge til Google Kalender, så den kan blive godkendt.

## 2. Installer StudieSync

1. Åbn projektets GitHub-side.
2. Vælg **Code → Download ZIP**.
3. Pak ZIP-filen ud på computeren.
4. Åbn browserens udvidelsesside:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera: `opera://extensions`
   - Brave: `brave://extensions`
5. Aktivér **Udviklertilstand**.
6. Vælg **Indlæs udpakket**, og vælg projektmappen, hvor `manifest.json` ligger.

Lad mappen ligge samme sted efter installationen. Browseren indlæser udvidelsen direkte fra den.

## 3. Log ind på Studie+

Åbn [Studie+](https://all.studieplus.dk), og log ind som normalt. Lad fanen være åben. StudieSync bruger din aktive session og beder ikke om din Studie+-adgangskode.

## 4. Forbind Google Kalender

1. Klik på StudieSync-ikonet i browseren.
2. Vælg **Forbind Google Kalender**.
3. Log ind med den godkendte Gmail-konto.
4. Gennemgå Googles tilladelsesvindue.

Google kan vise en advarsel om, at appen ikke er verificeret. Følg kun den adgangsvejledning, som udvikleren har givet dig, hvis du forventede at bruge denne private udvidelse.

## 5. Synkronisér første gang

Når Google-kontoen er forbundet, bliver knappen **Synkronisér nu** tilgængelig.

Tryk på den. StudieSync læser skemaet fra Studie+ og opretter eller opdaterer begivenheder i sin egen kalender. Kalenderen hedder som standard **Studie+ skema**.

Åbn Google Kalender og kontrollér, at kalenderen og lektionerne vises korrekt.

## Dashboardet

Dashboardet giver et hurtigt overblik over:

- **Forbindelse:** om Google Kalender er forbundet.
- **Seneste synkronisering:** tidspunktet for seneste synkroniseringsforsøg.
- **Næste lektion:** den næste kommende begivenhed i StudieSync-kalenderen.
- **Synkroniseringshistorik:** tidligere kørsler, ændringer og eventuelle fejlkoder.

## Indstillinger

Åbn menuen med de tre prikker, og vælg **Indstillinger**.

- **Uger der indlæses:** hvor langt frem i skemaet StudieSync henter lektioner.
- **Automatisk synkronisering:** slår automatisk synkronisering til eller fra.
- **Hvor ofte:** intervallet mellem automatiske synkroniseringer.
- **Tidszone:** tidszonen, der bruges til lektionernes tidspunkter.
- **Kalenderens navn:** navnet på StudieSync-kalenderen i Google Kalender.
- **Farvetema:** Automatisk, Lys eller Mørk.

Indstillingerne gemmes automatisk. Automatisk synkronisering kræver, at browseren kører, og at en Studie+-fane er åben og logget ind.

## Hvis noget ikke virker

1. Kontrollér, at Studie+-fanen er åben og logget ind.
2. Åbn StudieSync-menuen, og vælg **Test Studie+ forbindelsen**.
3. Genindlæs Studie+-fanen, hvis forbindelsen ikke virker.
4. Notér fejlkoden og den tekniske tekst, hvis problemet fortsætter.
5. Slå fejlkoden op i afsnittet [Fejlkoder i README](../README.md#fejlkoder).

Del aldrig adgangskoder, Google-tokens, cookies eller sessionsdata. Slør e-mailadresser og private skemaoplysninger på skærmbilleder.

## Konto og kalender

Du kan skifte Google-konto eller logge ud via menuen. Når du logger ud, tilbagekaldes adgangen hos Google, og loginoplysningerne fjernes fra browseren. Kalenderen og dens begivenheder bliver liggende i Google Kalender.

Du kan åbne introduktionsguiden igen under **Indstillinger** (menuen med de tre prikker), hvis du får brug for at gennemgå opsætningen.
