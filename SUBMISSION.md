# Flappy Maze Race V3

## Short description

Small wings. Faster rivalry. Race 2–8 friends through a neon maze that grows harder with every stretch—fast sweeps, counterflow pairs, moving tunnels, safe checkpoints, and a finish worth chasing.

## Full description

Flappy Maze Race turns one-button flying into a real-time race with your crew. Create a room, share a link, and invite up to eight pilots from their own browsers—no player account or installation required. Everyone readies up, the host starts the countdown, and the rivalry takes flight.

V3 defaults to Hard, with 49 obstacles including 27 moving gates in a 90-second clean race. The course evolves continuously: forgiving early openings become tighter alternating passages, faster sweeping gates, coordinated counterflow pairs, moving tunnels, and pulsing gaps. Every pilot faces the same seeded maze and synchronized obstacle motion. Checkpoints keep mistakes recoverable without interrupting anyone else's run.

A live leaderboard, distinct character colors, names, and a highlighted local pilot keep the action readable. The first legitimate finish ends the round for everyone, with shared final results and quick group rematches on a fresh course.

## Instructions for judges

1. Open the verified public URL on at least two devices, ideally three.
2. Enter a name, choose room capacity (try 8), and create a room.
3. Share the invitation link. Join from two additional devices to demonstrate a three-player race with unfilled seats.
4. Everyone clicks **I'm ready**. The host clicks **Start race**.
5. Press **Space**, click, or tap the course repeatedly to flap. Forward movement is automatic.
6. Watch the continuous intensity indicator and moving-gate cues. A crash resets only its pilot to the latest safe checkpoint after a short penalty.
7. First across the finish wins. Compare the synchronized final leaderboard on every screen.
8. Everyone selects **Play again**; the host starts the rematch. A new seeded course keeps the same group together.

## Technical summary

One Node.js/Express application serves the canvas frontend and Socket.IO networking. The server owns the roster, course seed, 60 Hz movement/collisions/checkpoints, crossing times, and results; clients render snapshots around 20 Hz with short prediction/interpolation. A shared JavaScript engine keeps moving-gate geometry consistent between rendering and collision checks. Legal trajectory search and exact physics replay validate harder layouts off-thread. Configurable rooms support 2–8 real independent clients and 30-second token reconnection.

## Public link

**Not yet deployed or verified.** Replace this text only with the real HTTPS URL after the cross-device deployment checklist passes. Do not submit localhost.

## Cover image guidance

A genuine browser screenshot was not available in the build environment. After deployment, capture actual gameplay at 16:9 desktop size with three identifiable pilots, the live leaderboard, a moving gate, and the course intensity visible. Use the game's original title/menu as a second image if the submission supports it. Avoid presenting a generated mockup as gameplay evidence. No fabricated screenshot is included.

## Before submitting

Confirm the challenge's current official rules, eligibility, deadline, and required submission fields directly in the official challenge page. This package implements the requested multiplayer behaviors, but does not independently certify contest eligibility or compliance with rules not supplied here.
