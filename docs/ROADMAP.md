# Roadmap

Dette er projektets interne liste over planlagte forbedringer.

## Stabilitet og sikkerhed

- [x] Undgå dobbelt synkronisering, hvis automatisk og manuel synkronisering starter samtidig.
- [ ] Vis delvise synkroniseringsfejl og antal ændringer, der nåede kalenderen.
- [ ] Validér skemadata mere præcist, herunder ugyldige datoer, dubletter og manglende felter.
- [ ] Undersøg overgang fra implicit OAuth-tokenflow til Authorization Code med PKCE.
- [ ] Gennemgå, hvordan Google-tokens opbevares i browserens lokale storage.
- [ ] Tilføj automatiske sikkerhedstjek, dependency checks og statisk kodeanalyse i GitHub Actions.
- [ ] Test fejlsituationer som netværksfejl, udløbne tokens, tomme svar og Google rate limits.

## Funktioner

- [ ] Tilføj mulighed for at sætte automatisk synkronisering på pause.
- [ ] Giv brugeren besked, når synkronisering fejler.
- [ ] Vis kommende lektier i popup'en.
  - [ ] Undersøg håndtering af links med pladsholdertekst.
  - [ ] Undersøg, om filer knyttet til lektioner kan hentes.
- [ ] Opdag konflikter, hvis brugeren manuelt ændrer en begivenhed i Google Kalender.
- [ ] Understøt flere kalendere: Apple Kalender, Samsung Kalender og Outlook Kalender.
- [ ] Gør det muligt at eksportere skemaet som en .ics-fil.

## Brugeroplevelse

- [ ] Gør popup'en mere informativ med næste lektion, seneste synkronisering og forbindelsesstatus.
- [ ] Opdel indstillinger i kategorier som Kalender, Synkronisering, Udseende og Avanceret.
- [x] Vis synkroniseringshistorik med antal ændringer og eventuelle fejl.
- [ ] Tilføj en førstegangsvejledning til Studie+, Google-login og første synkronisering.
- [ ] Vis udvidelsens versionsnummer.
- [ ] Gør det muligt at eksportere fejlloggen som en fil.
