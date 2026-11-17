// ============================================================================
//  StudieSync – FEJLKODER
//  Alle fejl har en kode (E101, E301 osv.). Koden vises i popup'en sammen med
//  "Kontakt udvikleren". Tabellen herunder er også gengivet i README.md
//  (der er en test, som tjekker, at de to er ens).
//
//  Kodernes grupper:
//   E1xx  Google-login og opsætning        E4xx  Tolkning af Studie+-data
//   E2xx  Google Kalender                  E5xx  Beskyttelse af kalenderen
//   E3xx  Forbindelse til Studie+          E9xx  Andet
//
//  text = vises i popup'en.  fix = hvad brugeren selv kan prøve (kun README).
// ============================================================================

(() => {
  const CODES = {
    // --- E1xx: Google-login og opsætning ---
    E101: { text: "Google Client ID mangler.", fix: "Udvidelsen er sat forkert op. Kontakt udvikleren." },
    E102: { text: "Google-login blev afbrudt eller kunne ikke åbnes.", fix: "Prøv at forbinde igen, og gennemfør login i vinduet." },
    E103: { text: "Google afviste login.", fix: "Tjek, at din Gmail er godkendt af udvikleren (se Adgang)." },
    E104: { text: "Ugyldigt svar fra Google-login.", fix: "Prøv at forbinde igen." },
    E105: { text: "Google gav ikke adgang til kalenderen.", fix: "Prøv at forbinde igen, og tillad adgangen til Google Kalender." },

    // --- E2xx: Google Kalender ---
    E201: { text: "Google afviste adgangen (login udløbet).", fix: "Vælg Forbind Google Kalender, og log ind igen." },
    E202: { text: "Google nægtede adgang til kalenderen.", fix: "Tjek, at din Gmail er godkendt af udvikleren, og at du har givet tilladelse." },
    E203: { text: "Kalenderen eller en begivenhed blev ikke fundet.", fix: "Prøv at synkronisere igen. Kommer fejlen igen, så slet kalenderen \"Studie+ skema\" i Google Kalender og synkronisér." },
    E204: { text: "Google begrænsede antallet af kald.", fix: "Vent et par minutter, og synkronisér igen." },
    E205: { text: "Google Kalender har en serverfejl.", fix: "Vent lidt, og prøv igen." },
    E206: { text: "Uventet fejl fra Google Kalender.", fix: "Prøv igen. Kommer fejlen igen, så kontakt udvikleren." },

    // --- E3xx: Forbindelse til Studie+ ---
    E301: { text: "Ingen åben Studie+-fane. Åbn Studie+ og log ind.", fix: "Åbn Studie+ (all.studieplus.dk eller all.uddataplus.dk), log ind, og prøv igen." },
    E302: { text: "Kan ikke kontakte Studie+-siden.", fix: "Genindlæs Studie+-fanen, og prøv igen." },
    E303: { text: "Udvidelsen blev ikke indlæst i Studie+-fanen.", fix: "Genindlæs Studie+-fanen, og prøv igen." },
    E304: { text: "Studie+ svarede med en fejl, da siden skulle hentes.", fix: "Log ind på Studie+ igen, og prøv igen." },
    E305: { text: "Studie+'s version eller skematjeneste kunne ikke findes.", fix: "Studie+ er sandsynligvis opdateret. Kontakt udvikleren." },
    E306: { text: "Studie+ afviste skemakaldet (ikke logget ind).", fix: "Log ind på Studie+ igen i fanen, og prøv igen." },
    E307: { text: "Studie+ svarede med en fejl på skemakaldet.", fix: "Prøv igen lidt senere. Kommer fejlen igen, så kontakt udvikleren." },

    // --- E4xx: Tolkning af Studie+-data ---
    E401: { text: "Studie+ svarede i et uventet format.", fix: "Studie+ er sandsynligvis opdateret. Kontakt udvikleren." },
    E402: { text: "Studie+-dataene var beskadigede eller ufuldstændige.", fix: "Prøv igen. Kommer fejlen igen, så kontakt udvikleren." },
    E403: { text: "Studie+ sendte en ukendt datatype.", fix: "Studie+ er sandsynligvis opdateret. Kontakt udvikleren." },
    E404: { text: "Skemaet indeholdt en ugyldig lektion.", fix: "Kontakt udvikleren." },
    E405: { text: "Studie+ svarede med en serverfejl.", fix: "Log ind på Studie+ igen, og prøv igen. Kommer fejlen igen, så kontakt udvikleren." },
    E406: { text: "Studie+ returnerede ingen lektioner for perioden.", fix: "Tjek, at du har lektioner i perioden, eller vælg flere uger i udvidelsen." },
    E407: { text: "Kunne ikke finde datooverskrifterne i skemaet.", fix: "Kontakt udvikleren." },

    // --- E5xx: Beskyttelse af kalenderen (kalenderen er ikke ændret) ---
    E501: { text: "Skemaet kunne ikke valideres. Kalenderen er ikke ændret.", fix: "Prøv igen. Kommer fejlen igen, så kontakt udvikleren." },
    E502: { text: "Studie+ viste markant færre lektioner end kalenderen. Synkroniseringen blev stoppet for at beskytte kalenderen.", fix: "Genindlæs Studie+, og prøv igen. Kommer fejlen igen, så kontakt udvikleren." },

    // --- E9xx: Andet ---
    E901: { text: "Netværksfejl. Kunne ikke oprette forbindelse.", fix: "Tjek din internetforbindelse, og prøv igen." },
    E999: { text: "Ukendt fejl.", fix: "Kontakt udvikleren, og oplys fejlkoden og den tekniske tekst." }
  };

  // En fejl med kode. Koden står i beskeden som "[E301] ...", så den overlever, når
  // fejlen sendes mellem Studie+-fanen, baggrundsscriptet og popup'en som tekst.
  class StudySyncError extends Error {
    constructor(code, technical = "") {
      super(`[${code}] ${technical}`.trim());
      this.name = "StudySyncError";
      this.code = code;
    }
  }

  // Finder koden i en fejl (eller E999 hvis den ikke har en) og tekniske detaljer
  function describe(error) {
    const raw = String(error?.message ?? error ?? "");
    let code = raw.match(/\[(E\d{3})\]/)?.[1];
    if (!code && /failed to fetch|networkerror|load failed|network request failed/i.test(raw)) code = "E901";
    if (!CODES[code]) code = "E999";
    const technical = raw.replace(/^\[E\d{3}\]\s*/, "").slice(0, 300);
    return { code, text: CODES[code].text, technical };
  }

  // Laver den status, popup'en viser: fejlkode, kort tekst og "Kontakt udvikleren"
  function toStatus(error) {
    const { code, text, technical } = describe(error);
    const contact = globalThis.STUDIESYNC_CONFIG?.developerContact;
    const who = contact ? `Kontakt udvikleren (${contact})` : "Kontakt udvikleren";
    return {
      ok: false,
      code,
      message: `Fejl ${code}: ${text}`,
      detail: `${who} og oplys fejlkoden ${code}.` + (technical && technical !== text ? ` Teknisk: ${technical}` : "")
    };
  }

  globalThis.StudySyncError = StudySyncError;
  globalThis.STUDIESYNC_ERRORS = { CODES, describe, toStatus };
})();
