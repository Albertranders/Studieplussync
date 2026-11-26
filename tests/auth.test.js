import test from "node:test";
import assert from "node:assert/strict";
import { TASKS_SCOPE, buildAuthUrl, isConnected, isTokenFresh, parseAuthRedirect, withTokenRetry } from "../src/auth.js";

// Exercise OAuth URL construction, redirect validation, connection state, and token retry rules.
const REDIRECT = "https://abcdef.chromiumapp.org/";


test("auth URL contains client, redirect, scopes, and state", () => {
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

test("login_hint is included when the account email is known", () => {
  const url = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", loginHint: "elev@gmail.com" }));
  assert.equal(url.searchParams.get("login_hint"), "elev@gmail.com");
});

test("non-interactive sign-in requests prompt=none", () => {
  const url = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", interactive: false }));
  assert.equal(url.searchParams.get("prompt"), "none");
});

test("a valid redirect returns the token and expiration time", () => {
  const result = parseAuthRedirect(`${REDIRECT}#access_token=tok&expires_in=3600&state=s1`, "s1", 1000);
  assert.deepEqual(result, { token: "tok", expiresAt: 1000 + 3600 * 1000 });
});

test("mismatched state, provider errors, and interrupted sign-in are rejected", () => {
  assert.throws(() => parseAuthRedirect(`${REDIRECT}#access_token=t&state=andet`, "s1"), /ugyldigt/);
  assert.throws(() => parseAuthRedirect(`${REDIRECT}#error=access_denied&state=s1`, "s1"), /access_denied/);
  assert.throws(() => parseAuthRedirect(undefined, "s1"), /afbrudt/);
  assert.throws(() => parseAuthRedirect(`${REDIRECT}#state=s1`, "s1"), /ikke noget token/);
});

test("a token is fresh until 60 seconds before expiration", () => {
  assert.equal(isTokenFresh({ token: "t", expiresAt: 200_000 }, 100_000), true);
  assert.equal(isTokenFresh({ token: "t", expiresAt: 150_000 }, 100_000), false);
  assert.equal(isTokenFresh(undefined, 0), false);
});

test("a rejected token (401) gets one replacement and one retry", async () => {
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

test("errors other than 401 are not retried", async () => {
  let tokens = 0;
  await assert.rejects(
    withTokenRetry(async () => `t${++tokens}`, async () => { throw Object.assign(new Error("server"), { status: 500 }); }),
    /server/
  );
  assert.equal(tokens, 1);
});

test("a repeated 401 fails after one retry", async () => {
  let tokens = 0;
  await assert.rejects(
    withTokenRetry(async () => `t${++tokens}`, async () => { throw Object.assign(new Error("afvist"), { status: 401 }); }),
    /afvist/
  );
  assert.equal(tokens, 2);
});

test("connect and switch actions show the account chooser without login_hint", () => {
  const url = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", loginHint: "elev@gmail.com", selectAccount: true }));
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.equal(url.searchParams.get("login_hint"), null);
});

test("silent sign-in takes precedence over account selection", () => {
  const url = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", interactive: false, selectAccount: true, loginHint: "a@b.dk" }));
  assert.equal(url.searchParams.get("prompt"), "none");
  assert.equal(url.searchParams.get("login_hint"), "a@b.dk");
});

test("isConnected prefers the explicit flag and falls back to email or token", () => {
  assert.equal(isConnected({ googleConnected: false, loginHint: "a@b.dk" }), false);
  assert.equal(isConnected({ googleConnected: true }), true);
  assert.equal(isConnected({ loginHint: "a@b.dk" }), true);
  assert.equal(isConnected({ webToken: { token: "t" } }), true);
  assert.equal(isConnected({}), false);
  assert.equal(isConnected(), false);
});

test("scopet til Google Tasks bedes kun om, når det er slået til", () => {
  const off = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s" })).searchParams.get("scope").split(" ");
  const on = new URL(buildAuthUrl({ clientId: "c", redirectUri: REDIRECT, state: "s", tasks: true })).searchParams.get("scope").split(" ");
  assert.ok(!off.includes(TASKS_SCOPE));
  assert.ok(on.includes(TASKS_SCOPE) && on.includes("https://www.googleapis.com/auth/calendar.app.created"));
});
