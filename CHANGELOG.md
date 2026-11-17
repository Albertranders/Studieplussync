# Ændringslog

Vigtige ændringer i StudieSync. Nyeste version står øverst.

## 0.2.0

### Ændret
- Samlet browserens JavaScript-filer i `src/`.
- Samlet popupens HTML og CSS i `popup/`.
- Opdateret manifest, imports, tests og ZIP-pakning til den nye projektstruktur.
- Tilføjet automatisk kontrol af manifeststier, popup-referencer og lokale imports.
- Tilføjet GitHub Actions, der kører tests, strukturkontrol og pakning.

### Bemærk
- Synkroniseringslogikken og Google OAuth-flowet blev ikke ændret i denne version.
- Google-login og den rigtige Studie+-integration skal stadig testes manuelt i browseren.
