import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthUrl, isTokenFresh, needsWebAuthFlow, parseAuthRedirect } from "../auth.js";

const REDIRECT = "https://abcdef.chromiumapp.org/";

test("Opera og Edge bruger web-login, Chrome gør ikke", () => {
  const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";
  assert.equal(needsWebAuthFlow(chrome), false);
  assert.equal(needsWebAuthFlow(chrome + " OPR/115.0.0.0"), true);
  assert.equal(needsWebAuthFlow(chrome + " Edg/130.0.0.0"), true);
  assert.equal(needsWebAuthFlow(""), false);
});

test("auth-URL indeholder klient, redirect, scope og state", () => {
  const url = new URL(buildAuthUrl({ clientId: "cid", redirectUri: REDIRECT, state: "s1" }));
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("response_type"), "token");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT);
  assert.equal(url.searchParams.get("state"), "s1");
  assert.match(url.searchParams.get("scope"), /calendar\.app\.created$/);
  assert.equal(url.searchParams.get("prompt"), null);
});

test("ikke-interaktivt login beder om prompt=none", () => {
  const url = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", interactive: false }));
  assert.equal(url.searchParams.get("prompt"), "none");
});

test("gyldigt svar giver token og udløbstid", () => {
  const result = parseAuthRedirect(`${REDIRECT}#access_token=tok&expires_in=3600&state=s1`, "s1", 1000);
  assert.deepEqual(result, { token: "tok", expiresAt: 1000 + 3600 * 1000 });
});

test("forkert state, fejl og afbrydelse afvises", () => {
  assert.throws(() => parseAuthRedirect(`${REDIRECT}#access_token=t&state=andet`, "s1"), /ugyldigt/);
  assert.throws(() => parseAuthRedirect(`${REDIRECT}#error=access_denied&state=s1`, "s1"), /access_denied/);
  assert.throws(() => parseAuthRedirect(undefined, "s1"), /afbrudt/);
  assert.throws(() => parseAuthRedirect(`${REDIRECT}#state=s1`, "s1"), /ikke noget token/);
});

test("token er frisk indtil 60 sekunder før udløb", () => {
  assert.equal(isTokenFresh({ token: "t", expiresAt: 200_000 }, 100_000), true);
  assert.equal(isTokenFresh({ token: "t", expiresAt: 150_000 }, 100_000), false);
  assert.equal(isTokenFresh(undefined, 0), false);
});
