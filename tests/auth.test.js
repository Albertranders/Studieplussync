import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthUrl, isConnected, isTokenFresh, parseAuthRedirect, withTokenRetry } from "../auth.js";

const REDIRECT = "https://abcdef.chromiumapp.org/";


test("auth-URL indeholder klient, redirect, scope og state", () => {
  const url = new URL(buildAuthUrl({ clientId: "cid", redirectUri: REDIRECT, state: "s1" }));
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("response_type"), "token");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT);
  assert.equal(url.searchParams.get("state"), "s1");
  const scopes = url.searchParams.get("scope").split(" ");
  assert.ok(scopes.includes("https://www.googleapis.com/auth/calendar.app.created"));
  assert.ok(scopes.includes("openid") && scopes.includes("email"));
  assert.equal(url.searchParams.get("login_hint"), null);
  assert.equal(url.searchParams.get("prompt"), null);
});

test("login_hint sendes med, når e-mailen er kendt", () => {
  const url = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", loginHint: "elev@gmail.com" }));
  assert.equal(url.searchParams.get("login_hint"), "elev@gmail.com");
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

test("afvist token (401) giver ét nyt token og ét genforsøg", async () => {
  let tokens = 0;
  const used = [];
  const result = await withTokenRetry(async () => `t${++tokens}`, async token => {
    used.push(token);
    if (token === "t1") throw Object.assign(new Error("afvist"), { status: 401 });
    return "ok";
  });
  assert.equal(result, "ok");
  assert.deepEqual(used, ["t1", "t2"]);
});

test("andre fejl end 401 genforsøges ikke", async () => {
  let tokens = 0;
  await assert.rejects(
    withTokenRetry(async () => `t${++tokens}`, async () => { throw Object.assign(new Error("server"), { status: 500 }); }),
    /server/
  );
  assert.equal(tokens, 1);
});

test("gentagen 401 giver op efter ét genforsøg", async () => {
  let tokens = 0;
  await assert.rejects(
    withTokenRetry(async () => `t${++tokens}`, async () => { throw Object.assign(new Error("afvist"), { status: 401 }); }),
    /afvist/
  );
  assert.equal(tokens, 2);
});

test("kontovælgeren vises ved forbind/skift konto, og login_hint udelades dér", () => {
  const url = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", loginHint: "elev@gmail.com", selectAccount: true }));
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.equal(url.searchParams.get("login_hint"), null);
});

test("stille login (prompt=none) vinder over kontovælgeren", () => {
  const url = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", interactive: false, selectAccount: true, loginHint: "a@b.dk" }));
  assert.equal(url.searchParams.get("prompt"), "none");
  assert.equal(url.searchParams.get("login_hint"), "a@b.dk");
});

test("isConnected: flaget vinder, ellers gættes ud fra e-mail eller token", () => {
  assert.equal(isConnected({ googleConnected: false, loginHint: "a@b.dk" }), false);
  assert.equal(isConnected({ googleConnected: true }), true);
  assert.equal(isConnected({ loginHint: "a@b.dk" }), true);
  assert.equal(isConnected({ webToken: { token: "t" } }), true);
  assert.equal(isConnected({}), false);
  assert.equal(isConnected(), false);
});
