# Tekster til Chrome Web Store

## Navn
StudieSync

## Kort beskrivelse (maks. 132 tegn)
Synkroniser dit Studie+ skema til Google Kalender automatisk – med lokaler, lærere, lektier og ændringer.

## Kategori
Produktivitet (Productivity). Sprog: Dansk.

## Detaljeret beskrivelse
StudieSync lægger dit skema fra Studie+ ind i din Google Kalender og holder det opdateret.

Sådan virker det:
1. Log ind på Studie+ i Chrome som du plejer.
2. Forbind din Google Kalender i StudieSync.
3. Tryk "Synkronisér nu". Herefter synkroniseres automatisk hvert 30. minut, mens Chrome er åben.

Det får du:
• Lektioner med tid, lokale, lærer, lektier og noter i en separat kalender, "Studie+ skema"
• Ændringer (nyt lokale, ny tid, aflysning) rettes automatisk
• Dine øvrige kalendere og events bliver aldrig rørt
• Du vælger selv, hvor mange uger frem der synkroniseres (1-12)

Privatliv og sikkerhed:
• Ingen kodeord, UNI•Login eller MitID bruges – udvidelsen bruger dit eksisterende login i Studie+
• Ingen server: dine data går direkte fra din browser til din egen Google Kalender
• Kun adgang til den kalender, udvidelsen selv opretter
• Hvis skemaet ikke kan læses sikkert, stopper synkroniseringen uden at ændre kalenderen

StudieSync er et uafhængigt projekt og er ikke tilknyttet eller godkendt af Studie+ eller Uddata+.

## Single purpose (formål med én funktion)
Udvidelsen synkroniserer brugerens Studie+ skema til en separat Google Kalender.

## Begrundelse for tilladelser (Permission justifications)
- **storage**: Gemmer kalenderens id, valgt antal uger og status for seneste synkronisering lokalt.
- **alarms**: Starter automatisk synkronisering hvert 30. minut.
- **identity**: Google-login (OAuth) til at oprette og opdatere kalenderen "Studie+ skema" via scope `calendar.app.created`.
- **Host permission https://all.uddataplus.dk/***: Læser skemaet fra brugerens egen åbne og indloggede Studie+-fane.
- **Host permission https://www.googleapis.com/***: Kalder Google Calendar API for at oprette, ændre og slette events i udvidelsens egen kalender.
- **Content script på https://all.uddataplus.dk/***: Læser skemaet fra siden, så udvidelsen ikke behøver kodeord eller cookies.
- **Fjernstyret kode**: Nej. Al kode ligger i pakken.

## Data usage (Privacy practices-fanen)
- Data der behandles: "Personligt identificerbare oplysninger" er ikke indsamlet af udvikleren. Skemadata (fag, tider, lokaler, lærere, lektier) overføres kun fra brugerens browser til brugerens egen Google Kalender.
- Sæt flueben i de tre erklæringer: sælges ikke til tredjepart, bruges ikke til formål uden relation til udvidelsens funktion, bruges ikke til kreditvurdering/lån.
- Privatlivspolitik-URL: https://github.com/Albertranders/Studieplussync/blob/main/PRIVACY.md

## Grafik der skal uploades (ikke lavet endnu)
- Mindst 1 skærmbillede, 1280×800 eller 640×400 (helst 3-5)
- Lille promo-felt: 440×280
- Ikon 128×128: ligger i icons/icon128.png
