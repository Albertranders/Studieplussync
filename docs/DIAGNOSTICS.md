# Fejlfinding og diagnosticering

Denne guide hjælper med at indsamle de oplysninger, der er nyttige, når StudieSync fejler.

## 1. Start med fejlkoden

Åbn StudieSync, og læs fejlkoden og den tekniske tekst i popup'en. Slå fejlkoden op i [fejlkataloget i README](../README.md#fejlkoder).

Prøv først den anbefalede løsning til fejlkoden. Genindlæs Studie+-fanen, hvis fejlen handler om forbindelsen til Studie+.

## 2. Kontrollér forbindelsen

1. Kontrollér, at du er logget ind på Studie+.
2. Kontrollér, at Studie+-fanen stadig er åben.
3. Åbn StudieSync og vælg **Test Studie+ forbindelsen**.
4. Notér, om testen lykkes, og hvor mange lektioner den finder.

Forbindelsestesten ændrer ikke Google Kalender.

## 3. Opret et issue ved fejl

Popup'en beskriver, hvad du selv kan gøre ved fejlen. Hjælper det ikke, kan du trykke på **Opret issue på GitHub** under fejlen, eller oprette et issue på https://github.com/Albertranders/Studieplussync/issues. Linket udfylder fejlkode, teknisk tekst og version for dig, og du gennemser og sender selv issuet.

Oplys disse oplysninger i issuet:

- Fejlkoden, for eksempel E301.
- Den tekniske fejltekst fra popup'en.
- Om forbindelsestesten lykkes.
- Om fejlen opstår ved manuel eller automatisk synkronisering.
- Browserens navn og version.
- StudieSync-versionen.

## 4. Del ikke følsomme oplysninger

Send aldrig adgangskoder, Google-tokens, cookies, sessionsdata eller komplette netværkslogs. Skærmbilleder bør gennemgås og sløres, så e-mailadresser, personlige skemaoplysninger og andre private data ikke fremgår.

## 5. Hvis kalenderen ser forkert ud

Undlad at slette kalenderen eller dens begivenheder, før fejlen er undersøgt. Oplys i stedet, hvad der mangler eller er forkert, og hvornår det sidst virkede.

