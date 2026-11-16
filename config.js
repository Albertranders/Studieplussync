// ============================================================================
//  StudieSync – OPSÆTNING
//  Alle indstillinger står i denne ene fil. Ret, gem, og genindlæs udvidelsen på
//  chrome://extensions (eller din browsers tilsvarende side). Der skal ikke køres
//  nogen kommandoer.
//  (Filen er almindelig JavaScript. Behold anførselstegnene "" omkring tekst.)
//
//  Du behøver normalt ikke ændre noget. Standardværdierne virker.
//
//  DET DER IKKE STÅR HER (fordi browseren kræver det i manifest.json):
//   - De Studie+-adresser udvidelsen må køre på. Står under "host_permissions" og
//     "content_scripts" → "matches" i manifest.json. Skifter Studie+ adresse igen,
//     tilføjes den nye dér (og i background.js → findStudyPlusTab).
//   - Udvidelsens navn, version og ikon (manifest.json).
// ============================================================================

globalThis.STUDIESYNC_CONFIG = {

  // --------------------------------------------------------------------------
  // 1. KAN ÆNDRES: Kalender og tid
  // --------------------------------------------------------------------------

  // Navnet på den kalender, der oprettes i Google Kalender.
  calendarName: "Studie+ skema",

  // Tidszone for lektionerne (IANA-navn, fx "Europe/Copenhagen").
  timeZone: "Europe/Copenhagen",

  // --------------------------------------------------------------------------
  // 2. KAN ÆNDRES: Synkronisering
  // --------------------------------------------------------------------------

  // Hvor ofte der synkroniseres automatisk (i minutter, mindst 1).
  // Teksten nederst i udvidelsens popup følger denne værdi.
  // Ændringen gælder først, når udvidelsen fjernes og indlæses igen.
  autoSyncMinutes: 30,

  // Antal uger der hentes (talt fra mandag i den aktuelle uge).
  defaultWeeks: 4,   // startværdi, før brugeren vælger noget i popup'en
  maxWeeks: 12,      // øvre grænse (1 er altid nedre grænse)

  // --------------------------------------------------------------------------
  // 3. AVANCERET: Rør kun ved, hvis noget er gået i stykker
  // --------------------------------------------------------------------------

  // Google OAuth Client ID – bruges i Chrome, Opera, Edge og andre Chromium-browsere.
  // Skal være en OAuth-klient af typen "Web application". Redirect-URI'en
  //   https://haknapnmhoblbadaiaehbkcniohlcifd.chromiumapp.org/
  // (udvidelsens faste Extension ID) skal være tilføjet i Google Cloud Console.
  // Ret kun dette, hvis du bruger dit eget Google-projekt.
  googleClientId: "644012646289-dpkv3hs4aqb1nirgk4075aoa6sjlslji.apps.googleusercontent.com",

  // Navnet på Studie+'s skema-modul (indgår i adresserne til serverkaldene).
  studiePlusModule: "skema",

  // Pause mellem skrivninger til Google Kalender (millisekunder), så Google ikke
  // begrænser antallet af kald.
  writeDelayMs: 300,

  // Maks. antal forsøg pr. kald til Google Kalender, før der gives op.
  maxTries: 6,
};
