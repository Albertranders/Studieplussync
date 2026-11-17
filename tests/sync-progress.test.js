import test from "node:test";
import assert from "node:assert/strict";
import { addPartialProgressToStatus, createSyncProgress } from "../src/sync-progress.js";

// Ensure reported progress includes only confirmed writes and safely describes partial failures.
test("tracks only confirmed create, update and delete operations", () => {
  const progress = createSyncProgress();
  progress.record("created");
  progress.record("updated");
  progress.record("deleted");
  progress.record("unknown");
  assert.deepEqual(progress.snapshot(), { created: 1, updated: 1, deleted: 1 });
});

test("leaves a failure status unchanged when no calendar writes completed", () => {
  const status = { ok: false, code: "E204", message: "Fejl E204.", detail: "Prøv igen." };
  assert.equal(addPartialProgressToStatus(status, { created: 0, updated: 0, deleted: 0 }), status);
});

test("explains partial changes and includes safe counts", () => {
  const result = addPartialProgressToStatus(
    { ok: false, code: "E204", message: "Fejl E204.", detail: "Kontakt udvikleren." },
    { created: 2, updated: 1, deleted: 0 }
  );
  assert.equal(result.partial, true);
  assert.equal(result.counts.created, 2);
  assert.equal(result.counts.updated, 1);
  assert.match(result.message, /3 ændringer blev gennemført/);
  assert.match(result.detail, /delvist opdateret/);
  assert.match(result.detail, /Kør synkronisering igen/);
  assert.equal(result.code, "E204");
});

test("does not expose negative or non-numeric progress", () => {
  const result = addPartialProgressToStatus({ ok: false, message: "Fejl." }, { created: -2, updated: "x", deleted: 1 });
  assert.deepEqual(result.counts, { lessons: 0, created: 0, updated: 0, deleted: 1, unchanged: 0 });
});
