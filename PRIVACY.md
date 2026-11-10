# Privatlivspolitik for StudieSync

Sidst opdateret: 10. november 2026

StudieSync er en Chrome-udvidelse, der læser dit skema fra Studie+ og lægger det i en separat kalender ("Studie+ skema") i din Google Kalender.

## Hvad udvidelsen behandler

- **Skemadata fra Studie+**: fag, tidspunkter, lokaler, lærere, lektier og noter. Dataene læses fra den Studie+-fane, du selv har åben og er logget ind i.
- **Adgang til Google Kalender**: via Googles login (OAuth) med kun scope `calendar.app.created`. Det giver adgang til at oprette og ændre den kalender, udvidelsen selv har oprettet. Udvidelsen kan ikke se eller ændre dine øvrige kalendere eller events.
- **Lokale indstillinger**: kalenderens id, antal uger der synkroniseres og status for seneste synkronisering. De gemmes i `chrome.storage.local` i din egen browser.

## Hvad udvidelsen ikke gør

- Den beder aldrig om og gemmer aldrig dit kodeord, UNI•Login eller MitID.
- Den sender ikke dine data, cookies eller login-oplysninger til udviklerens eller andre tredjeparters servere. Der findes ingen server bag udvidelsen.
- Den bruger ikke analyse, sporing eller annoncering, og den sælger eller deler ikke data.

## Hvor dine data havner

Skemadata sendes direkte fra din browser til Google Calendar API og gemmes i din egen Google-konto. Googles behandling af data er omfattet af Googles egen privatlivspolitik.

## Sletning

Fjern udvidelsen i Chrome for at slette de lokale indstillinger. Du kan også tilbagekalde adgangen på https://myaccount.google.com/permissions og slette kalenderen "Studie+ skema" i Google Kalender.

## Brug af data fra Googles API'er

StudieSyncs brug og overførsel af oplysninger modtaget fra Googles API'er til enhver anden app overholder Google API Services User Data Policy, herunder kravene om begrænset brug.

## Uafhængighed

StudieSync er et uafhængigt projekt og er ikke udviklet af, tilknyttet eller godkendt af Studie+ eller Uddata+.

## Kontakt

Spørgsmål kan stilles som et issue på https://github.com/Albertranders/Studieplussync/issues
