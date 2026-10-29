"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createValidator } = require("../course-validator");
test("course search runs off-thread, returns validated geometry, and rejects invalid tuning", async (t) => {
  const validator = createValidator();
  t.after(() => validator.close());
  let heartbeat = false;
  const work = validator.generate(123);
  await new Promise((r) =>
    setImmediate(() => {
      heartbeat = true;
      r();
    }),
  );
  assert.equal(heartbeat, true);
  const c = await work;
  assert.equal(c.seed, 123);
  assert.equal(c.obstacles.length, 49);
  assert.equal(c.obstacles.filter((o) => o.amplitude).length, 27);
  await assert.rejects(
    validator.generate(2, { finalGap: -1 }),
    /Invalid difficulty/,
  );
});
test("worker shutdown rejects outstanding work cleanly", async () => {
  const validator = createValidator();
  const pending = validator.generate(1);
  validator.close();
  await assert.rejects(pending, /shutting down/);
  await assert.rejects(validator.generate(2), /shutting down/);
});
