// ============================================================================
// Central error catalog. Codes are displayed in the popup and documented in
// README.md; a test checks that the two lists stay synchronized.
// E1xx: Google sign-in; E2xx: Google Calendar and Google Tasks; E3xx: Studie+ connection;
// E4xx: schedule parsing; E5xx: calendar protection; E9xx: other errors.
// `text` is shown in the popup; `fix` describes user troubleshooting steps.
// ============================================================================

(() => {
  const CODES = {
    // --- E1xx: Google-login og opsætning ---
    E101: { text: "Google Client ID mangler.", fix: "Udvidelsen mangler sit Google Client ID. Hent udvidelsen igen fra GitHub, eller indsæt dit eget Client ID i src/config.js (se README), og genindlæs udvidelsen." },
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
    E206: { text: "Uventet fejl fra Google Kalender.", fix: "Prøv igen om lidt." },
    E207: { text: "Google Tasks har ikke fået tilladelse.", fix: "Slå \"Læg afleveringer i Google Tasks\" fra og til igen i Indstillinger, og giv de tilladelser, der bliver bedt om." },
    E208: { text: "Google Tasks er ikke slået til i udviklerens Google-projekt.", fix: "Google Tasks API skal slås til i Google Cloud Console (se README). Prøv igen bagefter." },

    // --- E3xx: Forbindelse til Studie+ ---
    E301: { text: "Ingen åben Studie+-fane. Åbn Studie+ og log ind.", fix: "Åbn Studie+ (all.studieplus.dk eller all.uddataplus.dk), log ind, og prøv igen." },
    E302: { text: "Kan ikke kontakte Studie+-siden.", fix: "Genindlæs Studie+-fanen, og prøv igen." },
    E303: { text: "Udvidelsen blev ikke indlæst i Studie+-fanen.", fix: "Genindlæs Studie+-fanen, og prøv igen." },
    E304: { text: "Studie+ svarede med en fejl, da siden skulle hentes.", fix: "Log ind på Studie+ igen, og prøv igen." },
    E305: { text: "Studie+'s version eller skematjeneste kunne ikke findes.", fix: "Studie+ er sandsynligvis opdateret. Genindlæs Studie+-fanen, og prøv igen." },
    E306: { text: "Studie+ afviste skemakaldet (ikke logget ind).", fix: "Log ind på Studie+ igen i fanen, og prøv igen." },
    E307: { text: "Studie+ svarede med en fejl på skemakaldet.", fix: "Prøv igen lidt senere." },

    // --- E4xx: Tolkning af Studie+-data ---
    E401: { text: "Studie+ svarede i et uventet format.", fix: "Studie+ er sandsynligvis opdateret. Genindlæs Studie+-fanen, og prøv igen." },
    E402: { text: "Studie+-dataene var beskadigede eller ufuldstændige.", fix: "Prøv igen." },
    E403: { text: "Studie+ sendte en ukendt datatype.", fix: "Studie+ er sandsynligvis opdateret. Genindlæs Studie+-fanen, og prøv igen." },
    E404: { text: "Skemaet indeholdt en ugyldig lektion.", fix: "Genindlæs Studie+-fanen, og prøv igen. Fejlen skyldes en lektion uden dato eller tid i skemaet. Skriv i dit issue, hvilken dag den ligger på." },
    E405: { text: "Studie+ svarede med en serverfejl.", fix: "Log ind på Studie+ igen, og prøv igen." },
    E406: { text: "Studie+ returnerede ingen lektioner for perioden.", fix: "Tjek, at du har lektioner i perioden, eller vælg flere uger i udvidelsen." },
    E407: { text: "Afleveringerne havde et uventet format.", fix: "Studie+ er sandsynligvis opdateret. Genindlæs Studie+-fanen, og prøv igen." },

    // --- E5xx: Beskyttelse af kalenderen (kalenderen er ikke ændret) ---
    E501: { text: "Skemaet kunne ikke valideres. Kalenderen er ikke ændret.", fix: "Prøv igen. Genindlæs evt. Studie+-fanen først." },
    E502: { text: "Studie+ viste markant færre lektioner end kalenderen. Synkroniseringen blev stoppet for at beskytte kalenderen.", fix: "Genindlæs Studie+, og prøv igen." },

    // --- E9xx: Andet ---
    E901: { text: "Netværksfejl. Kunne ikke oprette forbindelse.", fix: "Tjek din internetforbindelse, og prøv igen." },
    E999: { text: "Ukendt fejl.", fix: "Genindlæs Studie+-fanen, og prøv igen." }
  };

  // Embed the code in the message so it survives text-only message passing.
  class StudySyncError extends Error {
    constructor(code, technical = "") {
      super(`[${code}] ${technical}`.trim());
      this.name = "StudySyncError";
      this.code = code;
    }
  }

  // Extract a known code and bounded technical details from an arbitrary error.
  function describe(error) {
    const raw = String(error?.message ?? error ?? "");
    let code = raw.match(/\[(E\d{3})\]/)?.[1];
    if (!code && /failed to fetch|networkerror|load failed|network request failed/i.test(raw)) code = "E901";
    if (!CODES[code]) code = "E999";
    const technical = raw.replace(/^\[E\d{3}\]\s*/, "").slice(0, 300);
    return { code, text: CODES[code].text, technical };
  }

  // Fejlrapporten udfyldes på hjemmesiden og sendes server-side til GitHub.
  const DEFAULT_WEBSITE_URL = "https://studieplussync-site.pages.dev";
  function issueUrl(code, text, technical) {
    const base = globalThis.STUDIESYNC_CONFIG?.websiteUrl || DEFAULT_WEBSITE_URL;
    const version = globalThis.chrome?.runtime?.getManifest?.()?.version || "ukendt";
    const browser = globalThis.navigator?.userAgent || "ukendt";
    const details = [
      `Fejlkode: ${code}`,
      `Fejltekst: ${text}`,
      technical && technical !== text ? `Teknisk tekst: ${technical}` : "",
      `StudieSync-version: ${version}`,
      `Browser: ${browser}`
    ].filter(Boolean).join("\n");
    const url = new URL("/support.html", base);
    url.searchParams.set("title", `Fejl ${code}: ${text}`);
    url.searchParams.set("details", details);
    url.searchParams.set("code", code);
    return url.toString();
  }

  // Build the user-facing failure status shown in the popup.
  // Henviser først til hjemmesidens fejlfinding og tilbyder derefter en udfyldt fejlrapport.
  function toStatus(error) {
    const { code, text, technical } = describe(error);
    const fix = CODES[code].fix;
    return {
      ok: false,
      code,
      message: `Fejl ${code}: ${text}`,
      detail: `${fix} Se også hjælpesiden på ${globalThis.STUDIESYNC_CONFIG?.websiteUrl || "https://studieplussync-site.pages.dev"}/support.html. Hjælper det ikke, kan du oprette en fejlrapport via knappen nedenfor.` +
        (technical && technical !== text ? ` Teknisk: ${technical}` : ""),
      issueUrl: issueUrl(code, text, technical)
    };
  }

  globalThis.StudySyncError = StudySyncError;
  globalThis.STUDIESYNC_ERRORS = { CODES, describe, toStatus, issueUrl };
})();
