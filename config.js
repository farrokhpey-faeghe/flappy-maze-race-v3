"use strict";
// Shared DEFAULTS/PRESETS are in public/engine.js. Keep physics unchanged.
// Override any geometry field here; run the 100-seed suite after tuning.
module.exports = {
  course: {
    preset: process.env.DIFFICULTY_PRESET || "Hard",
    durationSeconds: Number(process.env.COURSE_SECONDS || 90),
  },
  countdownMs: 3000,
  graceMs: 30000,
  roomIdleMs: 30 * 60 * 1000,
};
