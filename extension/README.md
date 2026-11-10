# StudieSync Chrome Extension

Chrome-plugin til at synkronisere Studie+ med en separat Google Kalender.

## Status

Dette er første implementeringsgrundlag. Google Kalender-synkroniseringen og sikker sammenligningslogik er implementeret. Studie+-udtrækket bruger foreløbig en DOM-adapter med flere mulige selectors. Studie+ kan ændre sin markup, og udtrækket skal valideres mod en rigtig logget ind konto, før automatisk sletning eller bred distribution bør aktiveres.

## Installation til udvikling

1. Åbn `chrome://extensions`.
2. Slå Udviklertilstand til.
3. Vælg "Indlæs udpakket".
4. Vælg denne `extension`-mappe.
5. Åbn Studie+ i en anden fane og log ind.
6. Åbn pluginet og forbind Google Kalender.

## Google OAuth-konfiguration

Manifestet indeholder en pladsholder i `oauth2.client_id`. Udvikleren skal oprette et Google Cloud-projekt, aktivere Google Calendar API, konfigurere OAuth consent screen og oprette et OAuth Client ID til Chrome Extension med extensionens faste ID. Indsæt client ID i manifestet.

Pluginet anmoder kun om `calendar.app.created`, som er begrænset til kalendere oprettet af appen. Google beskriver scope'et som adgang til at oprette sekundære kalendere og se/oprette/ændre/slette events i dem: https://developers.google.com/identity/protocols/oauth2/scopes

Hvis appen sættes i produktion uden verificering, kan brugere møde Googles advarsel. Google oplyser, at apps med uverificerede scopes kan have et loft på 100 nye brugere; færre end 100 brugere til personlig brug kan fortsætte uden verificering. Det er ikke det samme som at være fritaget fra Googles politikker: https://support.google.com/cloud/answer/13464323

## Vigtigt om Studie+

Pluginet læser kun skemaet fra en allerede åben Studie+-session. Det beder ikke om UNI-login-kodeord eller MitID-oplysninger og kopierer ikke cookies til en ekstern server.

Den aktuelle DOM-adapter skal testes mod den faktiske skemavisning. Hvis den ikke kan genkende lektionerne, stopper synkroniseringen uden at ændre kalenderen.

## Sikkerhed

- Der gemmes ikke Studie+-kodeord eller cookies.
- Google-token håndteres af Chrome Identity API.
- Der oprettes en separat kalender kaldet "Studie+ skema".
- Kun events med StudieSyncs private markør må opdateres eller slettes.
- Tomme eller ugyldige skemaresultater afvises.
