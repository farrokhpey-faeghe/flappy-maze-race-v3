# Flappy Maze Race V3

**Faster gates. Denser mazes. Small wings.** V3 upgrades the existing V2 game with a significantly more active, continuous obstacle challenge while retaining the original 2–8-player rooms, canvas characters, interface, controls, checkpoints, and server-authoritative race rules.

V2 is preserved separately. This package is the V3 application, not a replacement architecture or simulated multiplayer demo.

## Start and play

Requires Node.js 22+; tested on 24.22.1.

```bash
npm ci
npm start
```

Open **http://localhost:3000**. If V2 is already running there, use:

```bash
PORT=3001 npm start
```

1. Choose your name and a room capacity from **2–8**; create a room.
2. Share the invitation link or code. Each friend joins in their own browser/device. Names can be edited in the lobby.
3. Everyone clicks **I'm ready**; the **host clicks Start race**. At least two connected ready players are required. An eight-seat room can start with only three players.
4. After the synchronized countdown, repeatedly press **Space**, click the course, or tap the course to flap. Gravity pulls down; forward movement is automatic.
5. Follow your outlined **YOU** character. Gold gates move vertically, cyan gates are moving tunnels, purple diamonds mark pulsing openings. Arrows show current vertical movement direction; motion rails show range and faint edge trails show recent motion.
6. A crash resets only its pilot to the latest checkpoint after a **750 ms penalty**. A further **750 ms wall shield** assists recovery; ceiling/floor still collide. Other pilots keep racing.
7. First legitimate finish ends the round. Everyone receives the same winner and immutable final leaderboard. Only actual finishers have finish times. Exact simultaneous crossings share first place.
8. For another race, everyone selects **Play again** and the host starts the rematch. A new validated seed is shared. The host can also reopen the lobby for replacement/new players.

Use independent browser profiles/private windows or independently opened tabs for local testing. Duplicating a room tab can copy its session token; duplicate pilot sessions are intentionally rejected.

**Localhost is only the server computer.** For different networks, deploy this Node application and share its real HTTPS URL. Players need no account, login, install, or development tools. This package itself is not a public deployment.

## What makes V3 harder

- Default **Hard** preset, with one continuous progression curve over a roughly **90-second** clean race.
- **49 obstacles and 27 vertically moving obstacles**, versus approximately 29 and 5 in V2.
- Five pulsing openings, two moving tunnel sections, and four intentionally opposite-phase pairs in the default course.
- Moving gates appear early. Their speed/amplitude rise with distance; late vertically moving gates comprise about **74%** of obstacles. Including pulsing gaps, about **84%** of the late obstacles are dynamic.
- Denser consecutive sweeps, alternating centers, counterflow pairs, moving tunnels, pulsing gaps, and much tighter static openings. Checkpoint approaches remain deliberately clear.
- Original physics remain **speed 145, gravity 900, flap −310, radius 13**. The bird was not made faster or larger to fake difficulty.
- The shared sine-based `obstacleAt()` still drives both authoritative collisions and client geometry. No independent random browser timers control motion.

### Measured defaults

`METRICS.json` contains reproducible exact measurements. Run `npm run measure` to regenerate the report after tuning.

| Measurement | Default Hard, 90 seconds |
| --- | --- |
| Total / vertically moving obstacles | **49 / 27** on each seed 0–99 |
| Moving angular frequency, seeds 0–99 | **1.207–2.746 rad/s** |
| Moving amplitude | **28.30–54.33 world units** |
| Peak vertical gate speed, amplitude × frequency | **34.16–149.17 units/s**, across those seeds |
| Center-to-center spacing | **189.79–368.11 units**, including checkpoint stretches |
| Clear distance from one obstacle's end to the next start | **99.43–320 units** |
| Plain stationary gaps | **139.16–220.69 units** |
| Moving gaps | **173.43–228.97 units** |
| Tightest possible pulsing opening | **116.72 units** |
| Checkpoints, including start | **5** |

A moving gap's whole motion envelope is not the usable opening at a particular moment. For late fast gates, simply hovering in a constant central band is no longer enough for all phases. The old V2 center-following controller failed 73/100 default V3 courses, while the new legal trajectory planner completed them. That is an algorithmic comparison, **not a human difficulty score or a promise that every strategy works**.

## Difficulty configuration

```bash
COURSE_SECONDS=120 npm start
DIFFICULTY_PRESET=Normal npm start
DIFFICULTY_PRESET=Expert COURSE_SECONDS=90 npm start
```

The default is **Hard**; no pre-race difficulty selection is added to the player flow. Environment variables come from the shell/hosting platform, not automatically from `.env.example`.

- **`config.js`** chooses server defaults and can override any course field.
- **`public/engine.js` → `PRESETS`** defines Normal/Hard/Expert geometry profiles.
- **`public/engine.js` → `DEFAULTS`** defines shared pacing, density, probability, and unchanged flight physics.

Example server configuration:

```js
course: {
  preset: 'Hard',
  durationSeconds: Number(process.env.COURSE_SECONDS || 90),
  density: 1,
  lateFrequency: 2.65,
  lateAmplitude: 55,
}
```

Do not change a preset's values only in its flattened copy inside DEFAULTS: preset geometry is reapplied by `generateCourse`. Edit PRESETS or supply explicit overrides in config.js.

| Setting | Hard/default value | Meaning |
| --- | --- | --- |
| `durationSeconds` | 90 | Clean race duration; supported range 30–240 seconds |
| `density` | 1 | Multiplier dividing obstacle intervals; validated range 0.5–1.5 |
| `earlySpacing`, `finalSpacing` | 320, 185 | Center spacing targets before clear checkpoint stretches |
| `earlyGap`, `finalGap` | 226, 126 | Stationary gap targets; pulsing openings shrink by a separately bounded amount |
| `earlyMovingGap`, `finalMovingGap` | 236, 172 | Moving gaps remain larger to accommodate faster passage |
| `earlyMovingProbability`, `lateMovingProbability` | .24, .76 | Thresholds used by a deterministic low-discrepancy moving-gate schedule |
| `earlyFrequency`, `lateFrequency` | 1.1, 2.65 | Angular frequency targets, rad/s |
| `earlyAmplitude`, `lateAmplitude` | 25, 55 | Vertical motion amplitude targets |
| `motionVariation` | .1 | Seeded frequency variation of ±5%; intentional paired gates share frequency |
| `progressionExponent` | .9 | Continuous curve: distance fraction raised to this power |
| `maxDifficulty` | 1 | Multiplier/cap on progression intensity, range 0–1 |
| `checkpointEvery` | 10 | Obstacles per recovery stretch |
| `checkpointApproach` | 230 | Clear distance before the next obstacle after a checkpoint |
| `checkpointClearance` | 90 | Checkpoint offset after the previous obstacle's end |
| `firstObstacle`, `finishRunout` | 600, 300 | Introductory approach and final clear stretch |

Frequency, amplitude, gap, spacing, and center variation change continuously with world position. New pattern introductions are staggered; the race never pauses or changes to a separate level. Threshold probabilities are converted to a repeatable schedule so small random samples do not accidentally produce an almost-static course.

**Configuration is not unlimited:** run `npm test` after tuning. A sampled geometry opening is not sufficient evidence of physical traversal. Aggressive custom combinations can be rejected by trajectory validation; there is no silent fallback to easier geometry.

## Validation: search, then actual physics replay

The old controller aimed only at static gate centers and could not anticipate fast motion. V3 retains it as a diagnostic baseline, but it no longer decides which geometry is allowed.

`planner.js` performs a deterministic beam search over legal flap/no-flap choices in 100 ms decision chunks. It retains diverse altitude, velocity, and flap-cooldown states and checks every 60 Hz intermediate step against the course at its real motion phase. Flaps are at least 200 ms apart on this decision grid, stricter than the original 110 ms minimum. A six-unit extra clearance margin is used during search.

Every found trajectory is then replayed with **the actual `flap()` and `stepPlayer()` functions**. A collision or rejected input fails validation. No invulnerability, collision disabling, teleporting during a run, player speed changes, or fabricated finish is used. Checkpoint tests begin at the actual checkpoint to test that recovery segment; the independent full-race test begins from the server's real current state and sends only flap packets.

Runtime generation validates three full-course motion offsets. If no route is found, it tries at most four different seeds **with the same difficulty settings**. Exhaustion returns a clear error; it never narrows the challenge to fit an easy controller. Tests validate raw generated seeds directly, not just seeds selected by retries.

Trajectory search runs in **Node worker threads**, two at a time with a bounded queue, so it cannot block the authoritative game loop. Worker lifecycle/error/shutdown behavior is tested. Creating a room or preparing a rematch may take a brief moment. A roster/readiness change while preparing a rematch cancels the stale start request safely.

## Architecture and preserved multiplayer

| File | Role |
| --- | --- |
| `public/engine.js` | Shared deterministic generator, motion, physics, collisions, recovery, palette |
| `config.js` | Server defaults and duration/preset environment variables |
| `game.js` | Course creation and replay-validated seed selection |
| `planner.js` | Legal trajectory search and exact physics replay; not a player bot |
| `course-worker.js`, `course-validator.js` | Bounded asynchronous validation work |
| `server.js` | Existing Express/Socket.IO rooms, host start, 60 Hz simulation, ~20 Hz snapshots, results and reconnects |
| `public/app.js`, HTML/CSS | Original UI with dynamic colors, motion rails, directional cues, trails and group HUD |
| `test/` | Difficulty/physics, independent network clients, frontend code harness, startup and worker checks |
| `scripts/measure.js`, `METRICS.json` | Reproducible density/motion measurements |

Server changes are limited to asynchronous course creation/validation, preventing stale asynchronous starts, and version metadata. The existing room protocol, flight rules, and single Node deployment remain intact.

The server owns roster, physics, checkpoints, collisions, crossing times and final results. Clients send only validated flap sequence numbers; snapshots contain every competitor. Course data is sent at join/start, not every game tick. Names/colors identify everyone; local prediction/opponent interpolation remain short and authoritative snapshots win.

Temporary disconnections pause that pilot for up to **30 seconds** while other pilots continue. Token reconnect preserves progress; expired/disappearing pilots forfeit. A three-player race continues with two eligible racers. A sole remaining eligible connected pilot wins by forfeit; no eligible connected winner yields no winner. Lobby host privileges transfer to another connected pilot. A countdown disconnect cancels it and clears readiness. Empty/abandoned rooms clean up; idle rooms expire after 30 minutes. Results freeze at round end and names/membership persist into group rematches. Late joiners cannot enter a frozen race roster.

## Deploy/update

See **UPGRADING.md** for safe changes to your existing GitHub repository and Render service. Keep the existing service URL and Node backend; do not deploy as a static site.

- Build: `npm ci --omit=dev`
- Start: `npm start`
- Health: `/health` (reports version 3)
- Environment: `NODE_ENV=production`, `COURSE_SECONDS=90`, `DIFFICULTY_PRESET=Hard`
- Keep **one server instance**. `PORT` and `0.0.0.0` binding are already handled.

The existing `render.yaml` service name is preserved. No database, new framework, paid dependency, or external game asset service was added. Worker threads are a built-in Node facility. Rooms are in memory and reset on restart/deploy/hosting sleep. Do not publish a localhost invitation as a public game link.

## Testing and release limits

Run `npm test` and see **TEST_REPORT.md** for actual results, phase coverage and remaining browser checks. All default Hard seeds 0–99 passed every-checkpoint reentry at three time offsets, totaling **1,500 legal zero-crash replays**. Networking tests use real independent 2/3/4/8-client WebSocket connections and a full three-client course completion.

Browser gameplay was attempted but the available cloud browser could not access this workspace's localhost. **Human challenge, visual readability on physical devices, audio, clipboard, physical touch, jitter/latency, and cross-network public play remain unverified.** Code-level frontend tests are not presented as browser QA. No public deployment or screenshot is fabricated. There are no known unresolved failures in the automated suite, but sampled phase/seed success is not a mathematical guarantee for every possible motion phase, custom preset, or network condition.

For useful human testing, play the first 15%, middle 35–60%, and final 85–100% on the same Hard course with 2–3 friends. Record completion rate, crashes per section, whether arrows were readable, and whether late pairs felt reactable. Repeat with physical phone taps and after a checkpoint crash. The report includes a concrete checklist. If a section feels unfair, report the seed, obstacle index, approximate timer and device so the exact geometry can be reproduced.

Submission copy and cover-image guidance are in **SUBMISSION.md**. Endless mode remains outside scope.
