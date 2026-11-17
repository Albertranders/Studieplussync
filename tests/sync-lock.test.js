import test from "node:test";
import assert from "node:assert/strict";
import { createSyncLock } from "../src/sync-lock.js";

// Verify exclusive acquisition, idempotent release, and subsequent reuse of the lock.
test("allows the first synchronization to acquire the lock", () => {
  const lock = createSyncLock();
  const release = lock.tryAcquire();
  assert.equal(typeof release, "function");
  assert.equal(lock.isLocked, true);
  release();
  assert.equal(lock.isLocked, false);
});

test("rejects a second synchronization while the first is active", () => {
  const lock = createSyncLock();
  const releaseFirst = lock.tryAcquire();
  assert.equal(lock.tryAcquire(), null);
  releaseFirst();
  assert.equal(typeof lock.tryAcquire(), "function");
});

test("releases the lock only once even if release is called repeatedly", () => {
  const lock = createSyncLock();
  const release = lock.tryAcquire();
  release();
  release();
  assert.equal(lock.isLocked, false);
  assert.equal(typeof lock.tryAcquire(), "function");
});

test("allows a new synchronization after the previous one releases", () => {
  const lock = createSyncLock();
  const releaseFirst = lock.tryAcquire();
  releaseFirst();
  const releaseSecond = lock.tryAcquire();
  assert.equal(typeof releaseSecond, "function");
  releaseSecond();
});
