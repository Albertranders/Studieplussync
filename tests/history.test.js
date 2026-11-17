import test from "node:test";
import assert from "node:assert/strict";
import { appendHistory, createHistoryEntry, HISTORY_LIMIT } from "../src/history.js";

// Verify history normalization, retention limits, and partial-sync summaries.
test("creates a compact successful manual history entry", () => {
  const entry = createHistoryEntry({ ok: true, message: "Synkroniseret.", counts: { lessons: 12, created: 2, updated: 1, deleted: 0, unchanged: 9 } }, "manual", "2026-11-17T12:00:00.000Z");
  assert.deepEqual(entry, { at: "2026-11-17T12:00:00.000Z", ok: true, trigger: "manual", message: "Synkroniseret.", counts: { lessons: 12, created: 2, updated: 1, deleted: 0, unchanged: 9 } });
});

test("stores only the error code and short message for failed attempts", () => {
  const entry = createHistoryEntry({ ok: false, code: "E301", message: "Fejl E301: Ingen fane." }, "automatic");
  assert.equal(entry.ok, false);
  assert.equal(entry.code, "E301");
  assert.equal(entry.trigger, "automatic");
  assert.equal("detail" in entry, false);
});

test("newest entries are first and history is capped", () => {
  const old = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => ({ at: new Date(2026, 0, i + 1).toISOString(), ok: true }));
  const result = appendHistory(old, { at: "2026-12-01T00:00:00.000Z", ok: true });
  assert.equal(result.length, HISTORY_LIMIT);
  assert.equal(result[0].at, "2026-12-01T00:00:00.000Z");
});

test("ignores malformed stored history", () => {
  assert.deepEqual(appendHistory([{ nope: true }, null], { at: "now", ok: false }), [{ at: "now", ok: false }]);
});

test("does not invent lesson totals for a partial synchronization", () => {
  const entry = createHistoryEntry({ ok: false, partial: true, message: "Delvis.", counts: { created: 2, updated: 1, deleted: 0 } });
  assert.deepEqual(entry.counts, { created: 2, updated: 1, deleted: 0 });
});
