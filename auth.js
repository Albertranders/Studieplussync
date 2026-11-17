// Rene hjælpefunktioner til Google-login i browsere uden Chromes eget login (fx Opera og Edge).
// Ingen chrome.*-kald her, så filen kan testes med `npm test`.

// Skal passe til en OAuth-klient af typen "Web application" i Google Cloud Console.
import "./errors.js";   // fejlkoder (se errors.js)
export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
// "openid email" bruges kun til at huske, HVILKEN Google-konto du loggede ind med (se loginHint herunder).
export const SCOPES = ["openid", "email", SCOPE];
export const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

// Bygger URL'en til Googles login-side (implicit flow, token returneres i redirect-URL'ens #-del).
// `loginHint` = e-mailen fra sidst. Så ved Google hvilken konto der menes, og viser hverken
// kontovælger eller login igen. Det gør den stille fornyelse (prompt=none) pålidelig,
// også når flere Google-konti er logget ind i browseren.
export function buildAuthUrl({ clientId, redirectUri, state, interactive = true, loginHint = "" }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    include_granted_scopes: "true"
  });
  if (loginHint) params.set("login_hint", loginHint);
  // Ved automatisk kørsel må Google ikke vise noget; så fejler kaldet stille i stedet for.
  if (!interactive) params.set("prompt", "none");
  return `${AUTH_ENDPOINT}?${params}`;
}

// Læser svaret fra redirect-URL'en. Returnerer { token, expiresAt } eller kaster en forståelig fejl.
export function parseAuthRedirect(redirectUrl, expectedState, now = Date.now()) {
  if (!redirectUrl) throw new StudySyncError("E102", "Google-login blev afbrudt.");
  const hash = new URL(redirectUrl).hash.replace(/^#/, "");
  const params = new URLSearchParams(hash || new URL(redirectUrl).search);
  if (params.get("error")) throw new StudySyncError("E103", `Google-login mislykkedes: ${params.get("error")}`);
  if (params.get("state") !== expectedState) throw new StudySyncError("E104", "Google-login mislykkedes (ugyldigt svar).");
  const token = params.get("access_token");
  if (!token) throw new StudySyncError("E105", "Google-login gav ikke noget token.");
  const seconds = Number(params.get("expires_in")) || 3600;
  return { token, expiresAt: now + seconds * 1000 };
}

// Kører `work(token)`. Afviser Google tokenet (fejl med status 401), hentes et nyt token,
// og arbejdet prøves én gang til. Så klarer en udløbet session sig selv i samme kørsel.
// `getToken` skal selv sørge for, at det afviste token ikke bruges igen (det ryddes i background.js).
export async function withTokenRetry(getToken, work) {
  try {
    return await work(await getToken());
  } catch (error) {
    if (error?.status !== 401) throw error;
    return await work(await getToken());
  }
}

// Er et gemt token stadig gyldigt (med 60 sekunders sikkerhedsmargin)?
export function isTokenFresh(cached, now = Date.now()) {
  return Boolean(cached?.token) && cached.expiresAt - 60_000 > now;
}
