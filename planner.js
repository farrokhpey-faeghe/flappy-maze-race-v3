"use strict";
// Offline legal-input search. This is validation tooling, not a production player/bot.
const E = require("./public/engine");
const DT = 1 / 60,
  CHUNK = 6;
function planCourse(
  c,
  {
    delaySeconds = 0,
    checkpoint = 0,
    beamWidth = 64,
    margin = 6,
    startState = null,
  } = {},
) {
  const startX = startState?.x ?? c.checkpoints[checkpoint],
    ticks = Math.ceil(((c.finish - startX) / c.speed) * 60) + 1;
  const bounds = new Array(ticks + CHUNK),
    targets = new Array(ticks + CHUNK),
    velocities = new Array(ticks + CHUNK);
  // x and race time are independent of flap actions, so geometry is safely shared by all branches.
  for (let k = 0; k < bounds.length; k++) {
    const x = startX + (k + 1) * c.speed * DT,
      time = delaySeconds + (k + 1) * DT;
    let top = c.radius,
      bottom = c.height - c.radius;
    for (const o of c.obstacles) {
      if (x + c.radius > o.x && x - c.radius < o.x + o.w) {
        const b = E.obstacleAt(o, time);
        top = Math.max(top, b.top + c.radius);
        bottom = Math.min(bottom, b.bottom - c.radius);
      }
    }
    bounds[k] = [top, bottom];
    const next = c.obstacles.find((o) => o.x + o.w + c.radius > x);
    if (next && next.x - x < 230) {
      const arrival = time + Math.max(0, next.x - x) / c.speed;
      const b = E.obstacleAt(next, arrival);
      targets[k] = (b.top + b.bottom) / 2;
      velocities[k] =
        next.amplitude *
        next.frequency *
        Math.cos(arrival * next.frequency + next.phase);
    } else {
      targets[k] = c.height / 2;
      velocities[k] = 0;
    }
  }
  let beam = [
    {
      y: startState?.y ?? c.height / 2,
      v: startState?.vy ?? 0,
      last: -10000,
      cost: 0,
      node: null,
    },
  ];
  for (let k = 0; k < ticks; k += CHUNK) {
    const candidates = [];
    for (const b of beam)
      for (let action = 0; action <= 1; action++) {
        if (action && k - b.last < 7) continue;
        let y = b.y,
          v = action ? c.flap : b.v,
          valid = true;
        const end = Math.min(k + CHUNK, ticks);
        for (let j = k; j < end; j++) {
          v = Math.min(480, v + c.gravity * DT);
          y += v * DT;
          if (y < bounds[j][0] + margin || y > bounds[j][1] - margin) {
            valid = false;
            break;
          }
        }
        if (!valid) continue;
        const target = targets[end - 1],
          targetV = velocities[end - 1];
        // Beam retains diverse altitudes/velocities, not just one greedy center-following trajectory.
        const cost = (y - target) ** 2 * 0.012 + (v - targetV) ** 2 * 0.0004;
        candidates.push({
          y,
          v,
          last: action ? k : b.last,
          cost,
          node: { parent: b.node, tick: k, flap: !!action },
        });
      }
    if (!candidates.length)
      return { ok: false, failedTick: k, delaySeconds, checkpoint };
    candidates.sort((a, b) => a.cost - b.cost);
    const seen = new Set();
    beam = [];
    for (const b of candidates) {
      const key = `${Math.round(b.y / 3)}:${Math.round(b.v / 25)}:${Math.min(2, Math.floor((k + CHUNK - b.last) / CHUNK))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      beam.push(b);
      if (beam.length >= beamWidth) break;
    }
  }
  const flaps = [];
  let node = beam[0].node;
  while (node) {
    if (node.flap) flaps.push(node.tick);
    node = node.parent;
  }
  flaps.reverse();
  return { ok: true, flaps, ticks, delaySeconds, checkpoint, startState };
}
function replayPlan(c, plan) {
  if (!plan.ok) return plan;
  const p = {};
  E.resetPlayer(p, c);
  p.x = c.checkpoints[plan.checkpoint];
  p.checkpoint = plan.checkpoint;
  if (plan.startState) {
    p.x = plan.startState.x;
    p.y = plan.startState.y;
    p.vy = plan.startState.vy;
  }
  let seq = 0,
    index = 0;
  for (let tick = 0; tick < plan.ticks + 2; tick++) {
    const now = (plan.delaySeconds + tick / 60) * 1000;
    if (plan.flaps[index] === tick) {
      if (!E.flap(p, now, ++seq, c))
        return { ok: false, reason: "illegal flap", tick };
      index++;
    }
    const event = E.stepPlayer(
      p,
      DT,
      now,
      c,
      plan.delaySeconds + (tick + 1) / 60,
    );
    if (event === "crash") return { ok: false, reason: "collision", tick };
    if (event === "finish")
      return {
        ok: true,
        ticks: tick + 1,
        crashes: p.crashes,
        flaps: plan.flaps,
      };
  }
  return { ok: false, reason: "did not finish" };
}
function validateCourse(c, options = {}) {
  return replayPlan(c, planCourse(c, options));
}
module.exports = { planCourse, replayPlan, validateCourse };
