/* Shared pure functions: this exact file runs in Node and in the browser. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FlappyEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const PRESETS = Object.freeze({
    Normal: {
      earlySpacing: 350,
      finalSpacing: 220,
      earlyGap: 230,
      finalGap: 150,
      earlyMovingGap: 240,
      finalMovingGap: 190,
      earlyFrequency: 1.0,
      lateFrequency: 1.9,
      earlyAmplitude: 22,
      lateAmplitude: 42,
    },
    Hard: {
      earlySpacing: 320,
      finalSpacing: 185,
      earlyGap: 226,
      finalGap: 126,
      earlyMovingGap: 236,
      finalMovingGap: 172,
      earlyFrequency: 1.1,
      lateFrequency: 2.65,
      earlyAmplitude: 25,
      lateAmplitude: 55,
    },
    Expert: {
      earlySpacing: 305,
      finalSpacing: 175,
      earlyGap: 216,
      finalGap: 118,
      earlyMovingGap: 228,
      finalMovingGap: 164,
      earlyFrequency: 1.25,
      lateFrequency: 2.8,
      earlyAmplitude: 28,
      lateAmplitude: 58,
    },
  });
  const DEFAULTS = Object.freeze({
    durationSeconds: 90,
    height: 540,
    speed: 145,
    gravity: 900,
    flap: -310,
    radius: 13,
    startX: 100,
    preset: "Hard",
    ...PRESETS.Hard,
    density: 1,
    earlyMovingProbability: 0.24,
    lateMovingProbability: 0.76,
    progressionExponent: 0.9,
    maxDifficulty: 1,
    checkpointEvery: 10,
    checkpointApproach: 230,
    checkpointClearance: 90,
    firstObstacle: 600,
    finishRunout: 300,
    motionVariation: 0.1,
  });
  const PALETTE = [
    "#bcf575",
    "#77c6ff",
    "#ff9ed2",
    "#bda4ff",
    "#69ead2",
    "#ffc278",
    "#f8ed83",
    "#ff8f87",
  ];
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function intensity(x, c) {
    return clamp((x - c.startX) / (c.finish - c.startX), 0, 1);
  }
  function difficultyLabel(value) {
    return ["Easy", "Warming up", "Challenging", "Expert", "Final push"][
      Math.min(4, Math.floor(value * 5))
    ];
  }
  function obstacleAt(o, elapsedSeconds) {
    const shift =
      o.amplitude * Math.sin(elapsedSeconds * o.frequency + o.phase);
    const gap =
      o.gap -
      (o.pulse || 0) *
        (0.5 + 0.5 * Math.sin(elapsedSeconds * o.frequency * 0.7 + o.phase));
    return {
      top: o.center + shift - gap / 2,
      bottom: o.center + shift + gap / 2,
    };
  }
  function generateCourse(seed = 1, overrides = {}) {
    const preset = overrides.preset || DEFAULTS.preset;
    if (!PRESETS[preset])
      throw new Error("preset must be Normal, Hard or Expert");
    const c = { ...DEFAULTS, ...PRESETS[preset], ...overrides, preset };
    if (
      !Number.isFinite(c.durationSeconds) ||
      c.durationSeconds < 30 ||
      c.durationSeconds > 240
    )
      throw new Error("durationSeconds must be 30–240");
    for (const key of [
      "density",
      "earlySpacing",
      "finalSpacing",
      "earlyGap",
      "finalGap",
      "earlyMovingGap",
      "finalMovingGap",
      "earlyFrequency",
      "lateFrequency",
      "earlyAmplitude",
      "lateAmplitude",
      "progressionExponent",
      "checkpointApproach",
      "checkpointClearance",
    ])
      if (!Number.isFinite(c[key]) || c[key] <= 0)
        throw new Error("Invalid difficulty setting: " + key);
    if (
      c.density < 0.5 ||
      c.density > 1.5 ||
      c.maxDifficulty < 0 ||
      c.maxDifficulty > 1 ||
      !Number.isInteger(c.checkpointEvery) ||
      c.checkpointEvery < 4
    )
      throw new Error("Difficulty limits out of range");
    for (const key of [
      "earlyMovingProbability",
      "lateMovingProbability",
      "maxDifficulty",
    ])
      if (!Number.isFinite(c[key]) || c[key] < 0 || c[key] > 1)
        throw new Error("Invalid probability or cap: " + key);
    if (
      !Number.isFinite(c.motionVariation) ||
      c.motionVariation < 0 ||
      c.motionVariation > 0.5
    )
      throw new Error("Invalid motionVariation");
    c.finish = c.startX + c.speed * c.durationSeconds;
    c.seed = seed >>> 0;
    c.obstacles = [];
    c.checkpoints = [c.startX];
    const random = rng(seed);
    let x = c.firstObstacle,
      i = 0,
      previous = null;
    while (x < c.finish - c.finishRunout) {
      const d = intensity(x, c),
        curve = Math.pow(d, c.progressionExponent) * c.maxDifficulty;
      const probability =
        c.earlyMovingProbability +
        (c.lateMovingProbability - c.earlyMovingProbability) * curve;
      // A low-discrepancy schedule makes dynamic density predictable while seed varies phases/shape.
      const moving = i > 0 && (i * 0.61803398875) % 1 < probability;
      const tunnel = d > 0.2 && i % 9 === 5;
      const pulsing = d > 0.35 && !moving && i % 3 === 0;
      const pattern = moving
        ? tunnel
          ? "moving-tunnel"
          : i % 6 === 2
            ? "counterflow"
            : i % 6 === 3
              ? "alternating"
              : "sweep"
        : pulsing
          ? "pulse"
          : tunnel
            ? "tunnel"
            : "static";
      const frequency =
        (c.earlyFrequency + (c.lateFrequency - c.earlyFrequency) * curve) *
        (1 + c.motionVariation * (random() - 0.5));
      const amplitude = moving
        ? c.earlyAmplitude + (c.lateAmplitude - c.earlyAmplitude) * curve
        : 0;
      let center =
        270 +
        Math.sin(i * 1.12) * (16 + 30 * curve) +
        (random() - 0.5) * 10 * curve;
      let phase = random() * Math.PI * 2;
      // Intentionally coordinated pairs: same frequency, opposite direction, no random teleports.
      let paired = false;
      if (moving && previous?.amplitude && i % 4 === 3) {
        phase = previous.phase + Math.PI;
        paired = true;
      }
      const gap = moving
        ? c.earlyMovingGap + (c.finalMovingGap - c.earlyMovingGap) * curve
        : c.earlyGap + (c.finalGap - c.earlyGap) * curve;
      const o = {
        x,
        w: tunnel ? 82 + 22 * curve : 38 + 12 * curve,
        center,
        gap,
        amplitude,
        frequency: paired ? previous.frequency : frequency,
        phase,
        pulse: pulsing ? 8 + 8 * curve : 0,
        type: tunnel
          ? moving
            ? "moving-tunnel"
            : "tunnel"
          : moving
            ? "moving"
            : pulsing
              ? "pulse"
              : "gate",
        pattern: paired ? "opposite-pair" : pattern,
        difficulty: d,
      };
      c.obstacles.push(o);
      previous = o;
      x +=
        (c.earlySpacing + (c.finalSpacing - c.earlySpacing) * curve) /
        c.density;
      if (++i % c.checkpointEvery === 0 && x < c.finish - 550) {
        const cp = o.x + o.w + c.checkpointClearance;
        c.checkpoints.push(cp);
        x = Math.max(x, cp + c.checkpointApproach);
      }
    }
    return c;
  }
  function resetPlayer(p, c) {
    Object.assign(p, {
      x: c.startX,
      y: c.height / 2,
      vy: 0,
      checkpoint: 0,
      crashes: 0,
      respawnUntil: 0,
      invulnerableUntil: 0,
      finishTime: null,
      lastFlap: -Infinity,
      inputSeq: 0,
      forfeited: false,
    });
  }
  function flap(p, now, seq, c) {
    if (
      !Number.isSafeInteger(seq) ||
      seq <= p.inputSeq ||
      now - p.lastFlap < 110 ||
      now < p.respawnUntil ||
      p.finishTime !== null ||
      p.forfeited
    )
      return false;
    p.inputSeq = seq;
    p.lastFlap = now;
    p.vy = c.flap;
    return true;
  }
  function stepPlayer(p, dt, now, c, elapsedSeconds) {
    if (p.finishTime !== null || p.forfeited || now < p.respawnUntil)
      return null;
    p.x += c.speed * dt;
    p.vy = Math.min(480, p.vy + c.gravity * dt);
    p.y += p.vy * dt;
    const boundary = p.y - c.radius < 0 || p.y + c.radius > c.height;
    const wall = c.obstacles.some((o) => {
      if (p.x + c.radius <= o.x || p.x - c.radius >= o.x + o.w) return false;
      const b = obstacleAt(o, elapsedSeconds);
      return p.y - c.radius < b.top || p.y + c.radius > b.bottom;
    });
    if (boundary || (wall && now >= p.invulnerableUntil)) {
      p.crashes++;
      p.x = c.checkpoints[p.checkpoint];
      p.y = c.height / 2;
      p.vy = 0;
      p.respawnUntil = now + 750;
      p.invulnerableUntil = now + 1500;
      return "crash";
    }
    while (
      p.checkpoint + 1 < c.checkpoints.length &&
      p.x >= c.checkpoints[p.checkpoint + 1]
    )
      p.checkpoint++;
    return p.x >= c.finish ? "finish" : null;
  }
  // Test controller uses only legal flap decisions; never overrides positions or collision rules.
  function autopilot(p, c) {
    const next = c.obstacles.find((o) => o.x + o.w + c.radius + 5 > p.x);
    const target = next && next.x - p.x < 240 ? next.center : c.height / 2;
    return p.y > target + 20 && p.vy > 0;
  }
  function simulateCourse(c, { delaySeconds = 0, checkpoint = 0 } = {}) {
    const p = {};
    resetPlayer(p, c);
    p.x = c.checkpoints[checkpoint];
    p.checkpoint = checkpoint;
    let seq = 0;
    for (let tick = 0; tick < Math.ceil(c.durationSeconds * 60 + 600); tick++) {
      const time = delaySeconds + tick / 60,
        now = time * 1000;
      if (autopilot(p, c)) flap(p, now, ++seq, c);
      const event = stepPlayer(p, 1 / 60, now, c, time);
      if (event === "crash")
        return {
          ok: false,
          tick,
          obstacle: c.obstacles.find((o) => o.x > p.x)?.x,
        };
      if (event === "finish")
        return { ok: true, ticks: tick, crashes: p.crashes };
    }
    return { ok: false, reason: "timeout" };
  }
  return {
    DEFAULTS,
    PRESETS,
    PALETTE,
    intensity,
    difficultyLabel,
    obstacleAt,
    generateCourse,
    resetPlayer,
    flap,
    stepPlayer,
    autopilot,
    simulateCourse,
  };
});
