// ============================================================================
// StudieSync configuration.
// Edit values here, save the file, and reload the extension in the browser.
// Most users can keep the defaults unchanged.
//
// Browser-required settings live in manifest.json, including allowed site
// addresses, extension name, version, and icons.
// ============================================================================

globalThis.STUDIESYNC_CONFIG = {

  // --------------------------------------------------------------------------
  // 1. User-configurable calendar, time-zone, and contact settings.
  // --------------------------------------------------------------------------

  // Name assigned to the calendar created in Google Calendar.
  calendarName: "Studie+ skema",

  // IANA time zone used for lesson times.
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Copenhagen",

  // Hvor brugere kan oprette et issue, hvis en fejl ikke kan løses med den vejledning, popup'en viser.
  issuesUrl: "https://github.com/Albertranders/Studieplussync/issues",

  // Offentlig hjælpeside og vejledninger.
  websiteUrl: "https://studieplussync-site.pages.dev",

  // --------------------------------------------------------------------------
  // 2. User-configurable synchronization settings.
  // --------------------------------------------------------------------------

  // Automatic-sync interval in minutes; the popup displays this configured value.
  autoSyncMinutes: 30,

  // Number of weeks loaded, counted from Monday of the current week.
  defaultWeeks: 4,   // Initial value until the user chooses another value.
  maxWeeks: 12,      // Upper bound; the minimum supported value is one week.

  // --------------------------------------------------------------------------
  // 3. Advanced settings; change only when maintaining the integration.
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
  // begrænser antallet af kald. Pausen gælder pr. parallel skrivning (se writeConcurrency).
  writeDelayMs: 200,

  // Synkronisering, når Studie+ åbnes: ventetid efter, at siden er indlæst (millisekunder), og hvor ny
  // den seneste vellykkede synkronisering må være, før der springes over (minutter). Gælder kun, når
  // automatisk synkronisering er slået til.
  openSyncDelayMs: 3000,
  openSyncMinAgeMinutes: 5,

  // Antal skrivninger til Google Kalender, der kører samtidigt. Sæt til 1 for at skrive én ad gangen.
  writeConcurrency: 3,

  // Maks. antal forsøg pr. kald til Google Kalender, før der gives op.
  maxTries: 6,
};
