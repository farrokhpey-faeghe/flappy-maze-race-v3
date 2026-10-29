# Flappy Maze Race V3 — actual verification

Verification date: October 28, 2026. Runtime: Node.js 24.22.1.

## Results

- **24 V3 automated tests passed, 0 failed** with `npm test` (about 22 seconds).
- **21 V2 tests passed, 0 failed** against the separate, preserved V2 project.
- V3 starts successfully with `npm start`. The startup test launches the real production server entry and verifies HTTP 200 for `/`, `/app.js`, `/engine.js`, `/style.css`, `/socket.io/socket.io.js`, and `/health`; health reports version 3.
- Frontend/server syntax checks passed.
- `npm audit --omit=dev`: **0 vulnerabilities** at verification time.
- V2 source/archive was retained separately; V3 was not written over it.

## Measured challenge

`METRICS.json` and `npm run measure` provide exact reproducible results.

| Metric | V3 Hard, 90 seconds |
| --- | --- |
| Obstacle count, seeds 0–99 | 49 on every course |
| Vertically moving obstacles | 27 on every course |
| Additional pulsing obstacles | 5 |
| Moving tunnel sections | 2, included in the 27 movers |
| Coordinated opposite-phase pairs | 4 |
| Late-course vertical motion share (65% onward) | 14/19 = 73.68% |
| Late-course dynamic share, including pulsing gaps | 16/19 = 84.21% |
| Moving angular frequency across seeds 0–99 | 1.2072–2.7456 rad/s |
| Moving amplitude | 28.2959–54.3295 units |
| Peak vertical speed = amplitude × angular frequency | 34.1577–149.1677 units/sec |
| Center spacing, including checkpoint intervals | 189.7902–368.1111 units |
| Clear obstacle-end to next-start distance | 99.4293–320 units |
| Plain stationary gaps | 139.1576–220.6909 units |
| Moving gaps | 173.4305–228.9688 units |
| Minimum pulsing gap over all possible phases | 116.7156 units |
| Character diameter | Unchanged: 26 units |
| Checkpoints including start | 5 |

The course is denser, moving gates are substantially faster/larger, and moving tunnels/counterflow pairs require new timing. The original V2 greedy center-following controller failed **73 of 100** raw V3 courses; the improved planner completed them all. This is an objective algorithm baseline, not proof of human enjoyment or difficulty.

## Course and physics tests

1. **100 raw seeds**, directly generated without filtering/retries: deterministic equality, 45–60 total target, 20–30 moving target, increased late density/motion share, and faster/larger late movers.
2. Plain, moving, pulsing, counterflow and moving-tunnel geometry checked for safe world bounds and gap/spacing constraints at several motion phases.
3. **Every checkpoint of every one of those 100 courses**, including the start, tested at **0, 3.7 and 11.3 seconds** of motion offset: **1,500 successful legal zero-crash trajectory replays**.
4. Planner actions are chosen on a 100 ms grid, with legal flap cooldown. Search checks every intervening 60 Hz step and adds six units of clearance beyond the bird's collision radius.
5. A found plan is replayed through the exact original-style `flap()` and `stepPlayer()` APIs. Rejected flaps or any collision fail the test. No speed change, shield, teleport during a run, collision bypass or fabricated completion is used. Checkpoint tests initialize at the legitimate safe checkpoint to test that recovery segment.
6. Duration configurations 60, 75, 120, and 150 seconds, five seeds each: completed. Normal/Hard/Expert presets, five seeds each: completed.
7. Invalid duration, preset, density, frequency, gap and checkpoint settings rejected. An intentionally impossible 20-unit opening fails validation instead of bypassing collision.
8. Browser-exported and server-exported `obstacleAt()` return identical geometry at nine sampled times for every obstacle in a course. Counterflow pair shifts are verified to be opposite after amplitude normalization.
9. Original speed, gravity, flap impulse, radius, input sequence/rate checks and per-player collision/respawn rules retained and tested.

This demonstrates feasible legal trajectories for the tested seeds/phases, **not every possible phase, arbitrary tuning, latency condition or human strategy**. There is no claim that a simple open geometric path proves solvability. The solver can predict future motion; a human must learn and react to it.

## Real multiplayer regression tests

Actual independent Socket.IO clients connect over WebSockets to real HTTP/Socket.IO servers:

- Two-, three-, four- and eight-client rooms: shared membership/course, distinct colors, readiness, host-only start and synchronized countdown.
- An eight-seat room starts with only three connected ready pilots; empty seats do not block starting.
- Full-room rejection, invalid capacity/codes, sanitized names, independent simultaneous rooms and frozen-roster late-join rejection.
- Independent inputs for every pilot; forged position/finish fields have no effect; flaps cannot move pilots before GO.
- A collision resets only its pilot while others continue.
- **Full three-client course completion**, using a searched legal flap schedule sent over the network to the server's real current player state. No client teleport or finish RPC exists. Idle rivals incur actual crashes. All clients agree on the authoritative winner/ranking.
- Separate server-side near-finish fixtures exercise winner ordering and exact multiway ties. These fixtures are explicitly separate from full legal-input solvability tests.
- Immutable results survive departures. Rematches reset state and distribute a common fresh seed for 2/3/4/8 clients.
- Three-player temporary disconnect/reconnect, duplicate-token rejection, grace expiry and last-eligible-pilot forfeits.
- Host transfer, countdown disconnect cancellation, lobby reopening for replacement players, and abandoned/idle room cleanup.
- A readiness/roster change during asynchronous rematch validation cannot start a stale race.

The integration tests advance an injected server clock so a complete ~90-second race runs in about 12 seconds. Inputs and snapshots still travel through separate actual WebSocket connections.

## Worker and frontend checks

- Off-thread validation returns a replay-validated course, reports invalid tuning, and rejects work cleanly at shutdown.
- A small Node VM DOM/canvas harness executes the real frontend script against the actual HTML IDs. It verifies a 3/8-player lobby, Ready feedback, host Start availability, keyboard repeat/scroll prevention handlers, pointer flap handler, countdown, HUD/difficulty labels, drawing code and results without runtime errors.
- The harness does not evaluate real layout, browser focus, sound hardware, physical touch or perceived difficulty.

## Actual browser attempt and remaining limitations

The available cloud browser attempted to open the running V3 app at `http://localhost:3000` and returned **ERR_CONNECTION_REFUSED**. Its localhost cannot reach this workspace server. No actual browser gameplay, screenshot, console inspection, mobile visual pass or human difficulty assessment is claimed.

Still unverified:

- Human approachability, middle-course concentration, late-course reaction demands, fun and frustration.
- Motion cues/contrast on actual desktop and phone screens; portrait/landscape layout and animation quality.
- Real keyboard/mouse/touch, focus/scroll behavior, audio, clipboard permissions and browser session-storage refresh behavior (server token reconnection is verified).
- Internet latency/jitter and geographically separate human competition.
- Public Render deployment and cross-network browser play. No public URL was supplied, created or invented.

No unresolved automated-test failures are known. Sampled validation cannot establish universal solvability; unusual custom settings may cause room creation to report that no validated route was found. The same difficulty settings are retained across seed retries; no silent easy fallback is applied.

## Specific human playtest checklist

1. Start V3 separately with `PORT=3001 npm start`. Use the V3 URL, not an old V2 tab. Choose Hard and 90 seconds (defaults).
2. Join with three independent browser sessions/devices in an eight-seat room. Verify 3/8 count, Ready feedback and host Start.
3. At **0–15%**, assess learning time and whether the first moving gates are obvious. Avoid measuring only this introductory portion.
4. At **35–60%**, watch faster sweeps and first moving tunnels; record crashes, unclear arrows, and whether you can see enough of the approach.
5. At **85–100%**, record whether fast pairs can be anticipated, whether static/pulsing gaps require precision, and whether mistakes feel attributable to timing rather than invisible collision.
6. Crash deliberately near a moving gate; verify only your pilot resets and that the checkpoint approach is recoverable at the new global motion phase.
7. Compare every screen's winner, progress and final leaderboard. Run a rematch on a new shared seed.
8. Repeat with real phone taps, portrait/landscape, sound enabled and a mid-race refresh/reconnect.
9. Record seed (available in server course/state), obstacle index, approximate race timer, input method, device and crashes by early/middle/late segment when reporting a problem.
10. After deploying to the existing Render service, repeat from two different internet networks and check console/server logs before competition submission.

In-memory rooms still require a single Node service instance and reset on restart/deploy/hosting sleep. The supplied deployment guide preserves the existing GitHub/Render service rather than inventing a new URL.
