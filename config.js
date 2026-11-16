// ============================================================================
//  StudieSync – OPSÆTNING
//  Alt du skal udfylde eller kan ændre, står i denne ene fil.
//  (Filen er almindelig JavaScript. Behold anførselstegnene "" omkring tekst.)
// ============================================================================
//
//  SÅDAN GØR DU:
//   1. Udfyld afsnit 1 (Client ID'er).
//   2. Kør `node apply-config.js`  → kopierer chromeClientId over i manifest.json.
//      (Chrome læser kun sit Client ID fra manifest.json, ikke herfra.)
//   3. Genindlæs udvidelsen på chrome://extensions (eller opera://extensions).
//
//  DET DER IKKE STÅR HER (fordi browseren kræver det i manifest.json):
//   - De Studie+-adresser udvidelsen må køre på. Står under "host_permissions" og
//     "content_scripts" → "matches" i manifest.json. Skifter Studie+ adresse igen,
//     tilføjes den nye dér (og i background.js → findStudyPlusTab).
//   - Udvidelsens navn, version og ikon (manifest.json).
// ============================================================================

globalThis.STUDIESYNC_CONFIG = {

  // --------------------------------------------------------------------------
  // 1. SKAL UDFYLDES: Google Client ID'er
  //    Du får dem af Albertranders (Discord) eller opretter dem i Google Cloud Console.
  // --------------------------------------------------------------------------

  // Chrome: OAuth-klient af typen "Chrome-udvidelse".
  // Kopieres til manifest.json af `node apply-config.js`.
  chromeClientId: "INSERT CLIENT ID HERE",

  // Opera og Edge: OAuth-klient af typen "Web application".
  // Redirect-URI'en  https://<extension-id>.chromiumapp.org/  skal være tilføjet i
  // Google Cloud Console. Extension ID står på opera://extensions.
  webClientId: "INSERT WEB CLIENT ID HERE",

  // --------------------------------------------------------------------------
  // 2. KAN ÆNDRES: Kalender og tid
  // --------------------------------------------------------------------------

  // Navnet på den kalender, der oprettes i Google Kalender.
  calendarName: "Studie+ skema",

  // Tidszone for lektionerne (IANA-navn, fx "Europe/Copenhagen").
  timeZone: "Europe/Copenhagen",

  // --------------------------------------------------------------------------
  // 3. KAN ÆNDRES: Synkronisering
  // --------------------------------------------------------------------------

  // Hvor ofte der synkroniseres automatisk (i minutter). Chrome tillader min. 1.
  // Ændringen gælder først, når udvidelsen fjernes og indlæses igen.
  autoSyncMinutes: 30,

  // Antal uger der hentes (talt fra mandag i den aktuelle uge).
  defaultWeeks: 4,   // startværdi, før brugeren vælger noget i popup'en
  maxWeeks: 12,      // øvre grænse (1 er altid nedre grænse)

  // --------------------------------------------------------------------------
  // 4. AVANCERET: Rør kun ved, hvis noget er gået i stykker
  // --------------------------------------------------------------------------

  // Navnet på Studie+'s skema-modul (indgår i adresserne til serverkaldene).
  studiePlusModule: "skema",

  // Pause mellem skrivninger til Google Kalender (millisekunder), så Google ikke
  // begrænser antallet af kald.
  writeDelayMs: 300,

  // Maks. antal forsøg pr. kald til Google Kalender, før der gives op.
  maxTries: 6,
};
