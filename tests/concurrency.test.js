import test from "node:test";
import assert from "node:assert/strict";
import { runWithLimit } from "../src/concurrency.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("processes every item and never exceeds the limit", async () => {
  let active = 0, peak = 0;
  const seen = [];
  await runWithLimit([1, 2, 3, 4, 5, 6, 7], 3, async item => {
    active += 1; peak = Math.max(peak, active);
    await pause(5);
    seen.push(item);
    active -= 1;
  });
  assert.equal(seen.length, 7);
  assert.equal(peak, 3);
});

test("handles an empty list and a nonsensical limit", async () => {
  await runWithLimit([], 3, async () => { throw new Error("skal ikke køre"); });
  const seen = [];
  await runWithLimit([1, 2], 0, async item => { seen.push(item); });
  assert.deepEqual(seen, [1, 2]);
});

test("stops starting new work after a failure and rejects with the first error", async () => {
  const started = [];
  await assert.rejects(
    runWithLimit([1, 2, 3, 4, 5, 6], 2, async item => {
      started.push(item);
      await pause(2);
      if (item === 2) throw new Error("fejl 2");
    }),
    /fejl 2/
  );
  assert.ok(started.length < 6, "der blev startet nye opgaver efter fejlen");
});
