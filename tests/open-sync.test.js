import test from "node:test";
import assert from "node:assert/strict";
import { isQuietFailure, shouldSyncOnOpen } from "../src/open-sync.js";

const base = { autoSync: true, connected: true, now: Date.parse("2026-11-19T10:00:00Z"), minAgeMs: 5 * 60000 };

test("syncs on open when never synchronized or when the last sync is old enough", () => {
  assert.equal(shouldSyncOnOpen({ ...base, lastSyncAt: undefined }), true);
  assert.equal(shouldSyncOnOpen({ ...base, lastSyncAt: "2026-11-19T09:54:00Z" }), true);
  assert.equal(shouldSyncOnOpen({ ...base, lastSyncAt: "2026-11-19T09:55:00Z" }), true);
});

test("does not sync again right after a recent sync", () => {
  assert.equal(shouldSyncOnOpen({ ...base, lastSyncAt: "2026-11-19T09:58:00Z" }), false);
});

test("does not sync when automatic sync is off or Google is not connected", () => {
  assert.equal(shouldSyncOnOpen({ ...base, autoSync: false }), false);
  assert.equal(shouldSyncOnOpen({ ...base, connected: false }), false);
});

test("only 'page not ready / not logged in' failures are quiet", () => {
  for (const code of ["E301", "E302", "E303", "E304", "E306"]) assert.equal(isQuietFailure(code), true);
  for (const code of ["E401", "E502", "E204", "E999"]) assert.equal(isQuietFailure(code), false);
});
