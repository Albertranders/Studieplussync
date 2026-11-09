# Studie+ → Google Kalender

Henter dit skema fra Studie+ og holder en egen kalender ("Studie+ skema") i Google Kalender opdateret. Nye lektioner oprettes, ændringer (lokale, tider, aflysninger) rettes, og lektioner der forsvinder fjernes. Dine øvrige kalendere og events bliver aldrig rørt.

Web og app bruger samme Studie+-system, så ét login dækker begge dele.

## 1. Installér

Kræver Python 3.9+.

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # udfyld brugernavn, kodeord og skole
```

`STUDIEPLUS_SCHOOL` er skolens navn/kode som i Studie+-biblioteket `studieplus-api` (se dets README), hvis du er i tvivl.

## 2. Giv adgang til Google Kalender (engangsopsætning)

1. Gå til [Google Cloud Console](https://console.cloud.google.com/), opret et projekt og aktivér **Google Calendar API**.
2. Opsæt **OAuth consent screen** (type *External*) og tilføj din egen Gmail som testbruger.
3. Opret **OAuth client ID** af typen **Desktop app**, download JSON-filen og gem den her i mappen som `credentials.json`.
4. **Vigtigt for automatisk kørsel:** sæt consent screen til **In production** (kun til eget brug, du behøver ikke lade Google verificere den). Står den på *Testing*, udløber dit login efter 7 dage, og så stopper den automatiske synkronisering.

Programmet beder kun om adgang til at oprette og ændre *sin egen* kalender, ikke dine andre.

## 3. Kør

```bash
python sync.py --dry-run    # prøvekørsel: viser hvad der ville ske
python sync.py              # synkroniser rigtigt
```

Første gang åbner en browser, hvor du logger ind hos Google. Derefter gemmes login i `token.json`. Som standard synkroniseres 8 uger frem (ændres med `WEEKS_AHEAD` i `.env` eller `--weeks`).

## 4. Gør det automatisk

Kør først `python sync.py` manuelt én gang (for Google-login), og planlæg derefter.

**Mac / Linux / Raspberry Pi** (cron, hver time mellem 6 og 22):

```
0 6-22 * * * cd /sti/til/studieplus-gcal-sync && .venv/bin/python sync.py >> sync.log 2>&1
```

**Windows:** Opgaveplanlægning → opret opgave, der kører
`C:\sti\studieplus-gcal-sync\.venv\Scripts\python.exe sync.py` med "Start i" sat til mappen, f.eks. hver time.

Computeren (eller Raspberry Pi'en) skal være tændt, når opgaven kører.

## Sikkerhed og sikkerhedsnet

- `.env` indeholder dit UNI•Login-kodeord. Hold den privat; den er allerede i `.gitignore`.
- Hvis hentningen fra Studie+ fejler, ændres kalenderen ikke.
- Returnerer Studie+ et helt tomt skema, mens kalenderen har events, springes sletning over (overstyres med `--force`).
- Kun events med programmets eget skjulte mærke ændres eller slettes. Skriver du selv noget i "Studie+ skema"-kalenderen, bliver det liggende.

## Hvis det holder op med at virke

Studie+ har ingen officiel API. Biblioteket `studieplus-api` læser deres interne format, og det har ændret sig flere gange. Rettelserne kommer typisk hurtigt, så prøv først:

```bash
pip install --upgrade "studieplus-api @ git+https://github.com/ccoodduu/studieplus-api"
```

## Test

```bash
python -m pytest
```

Testene dækker synkroniseringslogikken og omsætningen af lektioner (uden netværk).
