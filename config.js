// ============================================================================
//  StudieSync – OPSÆTNING
//  Alt du skal udfylde eller kan ændre, står i denne ene fil.
//  (Filen er almindelig JavaScript. Behold anførselstegnene "" omkring tekst.)
// ============================================================================
//
//  SÅDAN GØR DU:
//   1. Udfyld googleClientId herunder (afsnit 1).
//   2. Gem filen.
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
  // 1. SKAL UDFYLDES: Google Client ID
  //    Du får det af Albertranders (Discord) eller opretter det i Google Cloud Console.
  // --------------------------------------------------------------------------

  // Google OAuth Client ID – bruges i Chrome, Opera og Edge.
  // Skal være en OAuth-klient af typen "Web application". Redirect-URI'en
  //   https://<extension-id>.chromiumapp.org/
  // skal være tilføjet i Google Cloud Console. Extension ID står på chrome://extensions
  // (eller opera://extensions).
  googleClientId: "644012646289-dpkv3hs4aqb1nirgk4075aoa6sjlslji.apps.googleusercontent.com",

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
