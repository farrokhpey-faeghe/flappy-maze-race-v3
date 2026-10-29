"use strict";
const engine = require("./public/engine");
const { planCourse, replayPlan, validateCourse } = require("./planner");
const config = require("./config");
function createCourse(seed, overrides = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const c = engine.generateCourse(
      (seed + Math.imul(attempt, 2654435761)) >>> 0,
      { ...config.course, ...overrides },
    );
    if (
      [0, 3.7, 11.3].every(
        (delaySeconds) => validateCourse(c, { delaySeconds }).ok,
      )
    )
      return c;
  }
  throw new Error(
    "No legal trajectory found for these difficulty settings. Review tuning and rerun tests.",
  );
}
module.exports = {
  ...engine,
  createCourse,
  planCourse,
  replayPlan,
  validateCourse,
};
