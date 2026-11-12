// Rene hjælpefunktioner til Google-login i browsere uden Chromes eget login (fx Opera og Edge).
// Ingen chrome.*-kald her, så filen kan testes med `npm test`.

// Skal passe til en OAuth-klient af typen "Web application" i Google Cloud Console.
export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

// Opera og Edge har ikke Chromes `getAuthToken`-login, så de bruger `launchWebAuthFlow`.
export function needsWebAuthFlow(userAgent = "") {
  return /\bOPR\//.test(userAgent) || /\bEdg(e|A|iOS)?\//.test(userAgent);
}

// Bygger URL'en til Googles login-side (implicit flow, token returneres i redirect-URL'ens #-del).
export function buildAuthUrl({ clientId, redirectUri, state, interactive = true }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    include_granted_scopes: "true"
  });
  // Ved automatisk kørsel må Google ikke vise noget; så fejler kaldet stille i stedet for.
  if (!interactive) params.set("prompt", "none");
  return `${AUTH_ENDPOINT}?${params}`;
}

// Læser svaret fra redirect-URL'en. Returnerer { token, expiresAt } eller kaster en forståelig fejl.
export function parseAuthRedirect(redirectUrl, expectedState, now = Date.now()) {
  if (!redirectUrl) throw new Error("Google-login blev afbrudt.");
  const hash = new URL(redirectUrl).hash.replace(/^#/, "");
  const params = new URLSearchParams(hash || new URL(redirectUrl).search);
  if (params.get("error")) throw new Error(`Google-login mislykkedes: ${params.get("error")}`);
  if (params.get("state") !== expectedState) throw new Error("Google-login mislykkedes (ugyldigt svar).");
  const token = params.get("access_token");
  if (!token) throw new Error("Google-login gav ikke noget token.");
  const seconds = Number(params.get("expires_in")) || 3600;
  return { token, expiresAt: now + seconds * 1000 };
}

// Er et gemt token stadig gyldigt (med 60 sekunders sikkerhedsmargin)?
export function isTokenFresh(cached, now = Date.now()) {
  return Boolean(cached?.token) && cached.expiresAt - 60_000 > now;
}
