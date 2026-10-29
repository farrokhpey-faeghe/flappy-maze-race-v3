"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const e = require("../game");
const average = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
test("100 seeds: density, dynamic share, faster late motion, patterns, gaps and checkpoints", () => {
  for (let seed = 0; seed < 100; seed++) {
    const c = e.generateCourse(seed);
    assert.deepEqual(c, e.generateCourse(seed));
    assert.ok(c.obstacles.length >= 45 && c.obstacles.length <= 60);
    const movers = c.obstacles.filter((o) => o.amplitude > 0);
    assert.ok(movers.length >= 20 && movers.length <= 30);
    const early = c.obstacles.filter((o) => o.difficulty < 0.3),
      late = c.obstacles.filter((o) => o.difficulty > 0.65),
      em = early.filter((o) => o.amplitude),
      lm = late.filter((o) => o.amplitude);
    assert.ok(
      average(lm.map((o) => o.frequency)) >
        average(em.map((o) => o.frequency)) * 1.4,
    );
    assert.ok(
      average(lm.map((o) => o.amplitude)) >
        average(em.map((o) => o.amplitude)) * 1.35,
    );
    assert.ok(
      lm.length / late.length >= 0.6 && lm.length / late.length <= 0.85,
    );
    const intervals = c.obstacles
      .slice(1)
      .map((o, i) => ({ d: o.difficulty, n: o.x - c.obstacles[i].x }));
    assert.ok(
      average(intervals.filter((o) => o.d < 0.3).map((o) => o.n)) >
        average(intervals.filter((o) => o.d > 0.65).map((o) => o.n)),
    );
    assert.ok(c.obstacles.some((o) => o.type === "moving-tunnel"));
    assert.ok(c.obstacles.some((o) => o.pattern === "opposite-pair"));
    assert.ok(c.obstacles.some((o) => o.type === "pulse"));
    for (let i = 0; i < c.obstacles.length; i++) {
      const o = c.obstacles[i];
      assert.ok(o.x + o.w < c.finish);
      assert.ok(o.gap - o.pulse > c.radius * 2 + 65);
      if (i) assert.ok(o.x - c.obstacles[i - 1].x - c.obstacles[i - 1].w >= 90);
      if (o.amplitude) {
        assert.ok(o.frequency >= 1 && o.frequency <= 2.8);
        assert.ok(o.amplitude >= 25 && o.amplitude <= 55);
      }
      for (const time of [0, 1.1, 3.7, 11.3, 29.8, 80.4, 193]) {
        const b = e.obstacleAt(o, time);
        assert.ok(b.top > c.radius && b.bottom < c.height - c.radius);
        assert.ok(b.bottom - b.top >= c.finalGap - 16);
      }
    }
    for (const cp of c.checkpoints) {
      assert.ok(
        !c.obstacles.some(
          (o) => cp + c.radius > o.x && cp - c.radius < o.x + o.w,
        ),
      );
      const next = c.obstacles.find((o) => o.x > cp);
      assert.ok(next.x - cp >= c.checkpointApproach - 1 || cp === c.startX);
    }
  }
});
test("100 seeds: legal zero-crash trajectories at every checkpoint and three time phases", () => {
  for (let seed = 0; seed < 100; seed++) {
    const c = e.generateCourse(seed);
    for (let checkpoint = 0; checkpoint < c.checkpoints.length; checkpoint++)
      for (const delaySeconds of [0, 3.7, 11.3]) {
        const plan = e.planCourse(c, { checkpoint, delaySeconds });
        assert.ok(
          plan.ok,
          JSON.stringify({ seed, checkpoint, delaySeconds, plan }),
        );
        for (let i = 1; i < plan.flaps.length; i++)
          assert.ok(plan.flaps[i] - plan.flaps[i - 1] >= 7);
        const replay = e.replayPlan(c, plan);
        assert.ok(
          replay.ok,
          JSON.stringify({ seed, checkpoint, delaySeconds, replay }),
        );
        assert.equal(replay.crashes, 0);
        if (checkpoint === 0)
          assert.ok(replay.ticks / 60 >= 89 && replay.ticks / 60 <= 91);
      }
  }
});
test("the old center-following controller is inadequate for V3, without relaxing geometry", () => {
  let failures = 0;
  for (let seed = 0; seed < 100; seed++) {
    const c = e.generateCourse(seed);
    if (!e.simulateCourse(c).ok) failures++;
  }
  assert.ok(failures >= 60, `legacy controller failures: ${failures}`);
});
test("configured durations and presets remain traversable; invalid tuning is rejected", () => {
  for (const durationSeconds of [60, 75, 120, 150])
    for (let seed = 0; seed < 5; seed++) {
      const c = e.generateCourse(seed, { durationSeconds });
      assert.equal((c.finish - c.startX) / c.speed, durationSeconds);
      assert.ok(
        e.validateCourse(c).ok,
        `duration ${durationSeconds}, seed ${seed}`,
      );
    }
  for (const preset of ["Normal", "Hard", "Expert"])
    for (let seed = 0; seed < 5; seed++)
      assert.ok(
        e.validateCourse(e.generateCourse(seed, { preset })).ok,
        `${preset}, ${seed}`,
      );
  for (const bad of [
    { durationSeconds: 0 },
    { durationSeconds: Infinity },
    { density: 0 },
    { lateFrequency: NaN },
    { preset: "Impossible" },
    { finalGap: -1 },
    { checkpointEvery: 1 },
  ])
    assert.throws(() => e.generateCourse(1, bad));
});
test("browser/server moving geometry is identical at many time phases including counterflow pairs", () => {
  const context = {};
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../public/engine"), "utf8"),
    context,
  );
  const c = e.generateCourse(123);
  for (const o of c.obstacles)
    for (const time of [0, 0.03, 0.5, 1.5, 3.7, 15, 38, 95, 189])
      assert.deepEqual(
        JSON.parse(JSON.stringify(context.FlappyEngine.obstacleAt(o, time))),
        e.obstacleAt(o, time),
      );
  const pair = c.obstacles.find((o) => o.pattern === "opposite-pair"),
    prior = c.obstacles[c.obstacles.indexOf(pair) - 1];
  for (const t of [0, 1, 2])
    assert.ok(
      Math.abs(
        (e.obstacleAt(pair, t).top + e.obstacleAt(pair, t).bottom) / 2 -
          pair.center +
          (((e.obstacleAt(prior, t).top + e.obstacleAt(prior, t).bottom) / 2 -
            prior.center) *
            pair.amplitude) /
            prior.amplitude,
      ) < 1e-8,
    );
});
test("flight constants, rate/replay validation and individual dynamic collisions are preserved", () => {
  const c = e.generateCourse(7),
    a = {},
    b = {};
  e.resetPlayer(a, c);
  e.resetPlayer(b, c);
  assert.deepEqual(
    [c.speed, c.gravity, c.flap, c.radius],
    [145, 900, -310, 13],
  );
  assert.equal(e.flap(a, 1000, 1, c), true);
  assert.equal(e.flap(a, 1001, 2, c), false);
  assert.equal(e.flap(a, 1200, 1, c), false);
  assert.equal(e.flap(a, 1200, NaN, c), false);
  assert.equal(e.flap(a, 1200, 2, c), true);
  const o = c.obstacles.find((o) => o.amplitude && o.x > c.checkpoints[1]);
  a.checkpoint = 1;
  a.x = o.x;
  a.y = e.obstacleAt(o, 8).top - 5;
  b.x = 1500;
  assert.equal(e.stepPlayer(a, 1 / 60, 8000, c, 8), "crash");
  assert.equal(a.x, c.checkpoints[1]);
  assert.equal(b.x, 1500);
  assert.equal(a.respawnUntil, 8750);
  assert.equal(e.flap(a, 8100, 3, c), false);
  e.stepPlayer(a, 1 / 60, 8200, c, 8.2);
  assert.equal(a.x, c.checkpoints[1]);
  assert.equal(a.crashes, 1);
});
test("invalid overly narrow layouts fail validation instead of bypassing collisions", () => {
  const c = e.generateCourse(1);
  for (const o of c.obstacles) o.gap = 20;
  assert.equal(e.validateCourse(c).ok, false);
});
