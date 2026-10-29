# Update your existing repository and Render service

Keep the working v2 folder/archive. Extract v3 into a separate directory first and test there:

```bash
cd flappy-maze-race-v3
npm ci
npm test
npm start
```

Try a three-player room in independently opened browser sessions. Every player readies up, then the host clicks **Start race**. Stop with Ctrl+C before switching versions. If v2 is still running on port 3000, use `PORT=3001 npm start` for v3 and visit that port.

## GitHub

In your existing repository, inspect `git status` and save/commit your intended v2 changes first. Ensure secrets and `node_modules` are ignored. Create a backup tag using an unused name, then a separate branch:

```bash
git tag flappy-maze-race-v2-backup
git push origin flappy-maze-race-v2-backup
git switch -c flappy-maze-race-v3
```

Copy the **contents** of the extracted v3 folder into this checkout: `server.js`, `game.js`, `config.js`, `planner.js`, `course-worker.js`, `course-validator.js`, `scripts/`, `METRICS.json`, `public/`, `test/`, package files, deployment config, environment example, and documentation. Keep your checkout's `.git` directory and remote settings. Do not copy `node_modules`, secrets, or an outer folder that would put `package.json` one directory too deep.

```bash
npm ci
npm test
git diff --stat
git status
```

Review the changes, then stage the intended project files, commit, and push:

```bash
git add server.js game.js config.js planner.js course-worker.js course-validator.js scripts METRICS.json public test package.json package-lock.json render.yaml .env.example .gitignore README.md TEST_REPORT.md UPGRADING.md SUBMISSION.md
git commit -m "Upgrade Flappy Maze Race to V3 fast dynamic Hard courses"
git push -u origin flappy-maze-race-v3
```

Open a pull request into your current deployment branch (often `main`), review it, and merge once ready. Your v2 backup tag and original archive remain available.

## Existing Render service

1. Open your **existing** Node Web Service. Preserve its repository connection, service name, public URL, and existing custom domain.
2. Check the root directory points to the folder containing `package.json`.
3. Keep build `npm ci --omit=dev`, start `npm start`, health `/health`, and one instance.
4. Set `DIFFICULTY_PRESET=Hard` and `COURSE_SECONDS=90` for the default. Keep `NODE_ENV=production`; Render supplies `PORT`.
5. Deploy the reviewed commit from the configured branch. If automatic deployment is enabled, merging to that branch can trigger it; otherwise choose the service's manual deployment action.
6. Wait for successful startup/health checks, then open the **actual existing service URL**. No URL is invented by this project.
7. Hard-refresh old tabs so v3's client and server versions match. Existing in-memory rooms reset on deployment; create a new room.
8. On three devices/browser sessions, join one eight-seat room, ready all three, and start. Verify live progress, moving gates, winner agreement, a rematch, and a mid-race reconnect.
9. Before competition submission, verify two devices on different networks using HTTPS and real mobile tap input. Copy only the verified URL into `SUBMISSION.md`.

No account/login is required for visiting players. Only the project owner needs GitHub/Render access to publish. Free services may sleep or cold-start; review your plan's limitations before a live demonstration. Do not add paid services without reviewing their cost.

For rollback, redeploy your earlier known-good commit in the same Render service. This preserves the existing public URL.
