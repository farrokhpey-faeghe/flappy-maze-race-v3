"use strict";
const E = require("../public/engine");
const range = (xs) => ({ min: Math.min(...xs), max: Math.max(...xs) });
function describe(c) {
  const moving = c.obstacles.filter((o) => o.amplitude > 0),
    late = c.obstacles.filter((o) => o.difficulty >= 0.65);
  return {
    seed: c.seed,
    preset: c.preset,
    durationSeconds: c.durationSeconds,
    obstacles: c.obstacles.length,
    movingObstacles: moving.length,
    pulsingObstacles: c.obstacles.filter((o) => o.pulse > 0).length,
    movingTunnels: c.obstacles.filter((o) => o.type === "moving-tunnel").length,
    oppositePairs: c.obstacles.filter((o) => o.pattern === "opposite-pair")
      .length,
    lateMovingShare: late.filter((o) => o.amplitude > 0).length / late.length,
    lateDynamicShare:
      late.filter((o) => o.amplitude > 0 || o.pulse > 0).length / late.length,
    movingFrequencyRadPerSec: range(moving.map((o) => o.frequency)),
    movingAmplitudeUnits: range(moving.map((o) => o.amplitude)),
    maximumVerticalGateSpeedUnitsPerSec: range(
      moving.map((o) => o.amplitude * o.frequency),
    ),
    centerToCenterSpacingUnits: range(
      c.obstacles.slice(1).map((o, i) => o.x - c.obstacles[i].x),
    ),
    freeEdgeSpacingUnits: range(
      c.obstacles
        .slice(1)
        .map((o, i) => o.x - c.obstacles[i].x - c.obstacles[i].w),
    ),
    staticGapUnits: range(
      c.obstacles.filter((o) => !o.amplitude && !o.pulse).map((o) => o.gap),
    ),
    movingGapUnits: range(moving.map((o) => o.gap)),
    minimumPulsedGapUnits: Math.min(
      ...c.obstacles.filter((o) => o.pulse).map((o) => o.gap - o.pulse),
    ),
    checkpoints: c.checkpoints.length,
  };
}
const courses = Array.from({ length: 100 }, (_, i) => E.generateCourse(i)),
  allMoving = courses.flatMap((c) => c.obstacles.filter((o) => o.amplitude));
const metrics = {
  defaultSeed1: describe(courses[1]),
  seeds0Through99: {
    obstacleCount: range(courses.map((c) => c.obstacles.length)),
    movingCount: range(
      courses.map((c) => c.obstacles.filter((o) => o.amplitude).length),
    ),
    frequencyRadPerSec: range(allMoving.map((o) => o.frequency)),
    amplitudeUnits: range(allMoving.map((o) => o.amplitude)),
    peakVerticalSpeedUnitsPerSec: range(
      allMoving.map((o) => o.amplitude * o.frequency),
    ),
    legacyCenterFollowingControllerFailures: courses.filter(
      (c) => !E.simulateCourse(c).ok,
    ).length,
  },
  notes: [
    "Spacing includes deliberately longer checkpoint recovery stretches.",
    "Peak vertical speed = amplitude × angular frequency; motion remains sinusoidal.",
    "Controller failures are an algorithmic baseline, not a human difficulty score.",
  ],
};
console.log(JSON.stringify(metrics, null, 2));
