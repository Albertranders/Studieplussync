# Privatlivspolitik for StudieSync

Sidst opdateret: 25. november 2026

StudieSync er en browserudvidelse (Chrome, Opera, Edge m.fl.), der læser dit skema fra Studie+ og lægger det i en separat kalender ("Studie+ skema") i din Google Kalender.

## Hvad udvidelsen behandler

- **Skemadata fra Studie+**: fag, tidspunkter, lokaler, lærere, lektier og noter. Udvidelsen læser også dine afleveringer (fag, titel og frist) for dem, du endnu ikke har afleveret. De vises i udvidelsen og sendes ikke til Google Kalender. Kun hvis du selv slår Google Tasks til, lægges de i Google Tasks (se nedenfor). Dataene læses fra den Studie+-fane, du selv har åben og er logget ind i.
- **Adgang til Google Kalender**: via Googles login (OAuth) med scopet `calendar.app.created`. Det giver adgang til at oprette og ændre den kalender, udvidelsen selv har oprettet. Udvidelsen kan ikke se eller ændre dine øvrige kalendere eller events. Scopene `openid` og `email` bruges kun til at læse din e-mailadresse, så udvidelsen kan huske, hvilken Google-konto du loggede ind med, og du ikke skal logge ind igen og igen.
- **Adgang til Google Tasks (valgfri, slået fra som standard)**: hvis du slår "Læg afleveringer i Google Tasks" til, beder udvidelsen om scopet `tasks`. Google har ikke et smallere scope, så det giver teknisk adgang til alle dine opgaver. Udvidelsen bruger kun sin egen liste "Studie+ afleveringer": den opretter, opdaterer og afslutter opgaver i den liste, læser ikke dine øvrige lister og sletter aldrig opgaver. Opgavernes titel, frist og en teknisk markør sendes til Google Tasks og ikke til andre. Slår du funktionen fra, bruges adgangen ikke længere; du kan fjerne den helt i din Google-kontos indstillinger under tredjepartsadgang.
- **Påmindelser (valgfri, slået fra som standard)**: slår du "Påmind mig om afleveringer" til, opretter udvidelsen en ekstra kalender, "Studie+ afleveringer", i din Google Kalender med begivenheder med fag, titel og frist for de afleveringer, du mangler. Det sker med den samme kalenderadgang som ovenfor, så der er ingen ny tilladelse. Begivenhederne sendes kun til Google Kalender. Slår du funktionen fra, slettes de.
- **Lokale indstillinger**: kalenderens id, din Google-e-mail (som login-tip), dine valg i Indstillinger (antal uger, automatisk synkronisering, tidszone, udseende og kalenderens navn) status for seneste synkronisering, synkroniseringshistorik, en lokal kopi af dit seneste skema (fag, tidspunkter og lokaler), så dagens lektioner vises med det samme, en lokal kopi af dine uafleverede afleveringer (fag, titel og frist), som vises i fanen Afleveringer, to tekniske værdier om Studie+'s version (ingen personlige data) og hvilke trin i introduktionsguiden du har gennemført. Dashboardet henter titel, tidspunkt og lokale på dagens lektioner fra din egen "Studie+ skema"-kalender og viser dem kun i popup'en. De gemmes i `chrome.storage.local` i din egen browser.

## Hvad udvidelsen ikke gør

- Den beder aldrig om og gemmer aldrig dit kodeord, UNI•Login eller MitID.
- Den sender ikke dine data, cookies eller login-oplysninger til udviklerens eller andre tredjeparters servere. Der findes ingen server bag udvidelsen.
- Den bruger ikke analyse, sporing eller annoncering, og den sælger eller deler ikke data.

## Hvor dine data havner

Skemadata sendes direkte fra din browser til Google Calendar API og gemmes i din egen Google-konto. Googles behandling af data er omfattet af Googles egen privatlivspolitik.

## Sletning

Vælg **Log ud af Google** i udvidelsens menu for at tilbagekalde adgangen og glemme din e-mail og dit login lokalt. Fjern udvidelsen i din browser for at slette alle lokale indstillinger. Du kan også tilbagekalde adgangen på https://myaccount.google.com/permissions og slette kalenderen "Studie+ skema" i Google Kalender.

## Brug af data fra Googles API'er

StudieSyncs brug og overførsel af oplysninger modtaget fra Googles API'er til enhver anden app overholder Google API Services User Data Policy, herunder kravene om begrænset brug.

## Uafhængighed

StudieSync er et uafhængigt projekt og er ikke udviklet af, tilknyttet eller godkendt af Studie+ eller Uddata+.

## Kontakt

Spørgsmål kan stilles som et issue på https://github.com/Albertranders/Studieplussync/issues
