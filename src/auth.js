// Pure helpers for Google sign-in in browsers without Chrome's built-in identity flow.
// This module avoids chrome.* APIs so its behavior can be tested with `npm test`.

// The OAuth client must be configured as a "Web application" in Google Cloud Console.
import "./errors.js"; // Load the shared error class used for invalid OAuth responses.
export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
// OpenID scopes identify the account used for future silent token refreshes.
export const SCOPES = ["openid", "email", SCOPE];
// Google har ikke et smallere scope til Tasks. Det bedes derfor kun om, når brugeren slår Google Tasks til.
export const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
export const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
// Revoke the current account's grant when the user explicitly signs out.
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// Build Google's authorization URL, including account-selection hints when requested.
// `loginHint` keeps silent refreshes tied to the previously connected account.
// `selectAccount` forces the account chooser for connect and switch-account actions.
export function buildAuthUrl({ clientId, redirectUri, state, interactive = true, loginHint = "", selectAccount = false, tasks = false }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: redirectUri,
    scope: (tasks ? [...SCOPES, TASKS_SCOPE] : SCOPES).join(" "),
    state,
    include_granted_scopes: "true"
  });
  const choose = interactive && selectAccount;
  if (loginHint && !choose) params.set("login_hint", loginHint);
  // Background refreshes must not open a window, so ask Google to fail silently.
  if (!interactive) params.set("prompt", "none");
  else if (choose) params.set("prompt", "select_account");
  return `${AUTH_ENDPOINT}?${params}`;
}

// Prefer the explicit connection flag, while retaining compatibility with older installations.
export function isConnected({ googleConnected, loginHint, webToken } = {}) {
  if (typeof googleConnected === "boolean") return googleConnected;
  return Boolean(loginHint || webToken?.token);
}

// Validate the OAuth redirect and return its access token and expiration timestamp.
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

// Retry work once with a fresh token when Google rejects the current one with HTTP 401.
// `getToken` must invalidate rejected tokens before returning a replacement.
export async function withTokenRetry(getToken, work) {
  try {
    return await work(await getToken());
  } catch (error) {
    if (error?.status !== 401) throw error;
    return await work(await getToken());
  }
}

// Treat tokens expiring within 60 seconds as stale to avoid mid-request expiration.
export function isTokenFresh(cached, now = Date.now()) {
  return Boolean(cached?.token) && cached.expiresAt - 60_000 > now;
}
