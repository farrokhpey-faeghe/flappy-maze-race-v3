"use strict";
const express = require("express");
const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { Server } = require("socket.io");
const { resetPlayer, flap, stepPlayer, PALETTE } = require("./game");
const config = require("./config");
const { createValidator } = require("./course-validator");
const randomSeed = () => randomBytes(4).readUInt32LE();
function createGameServer(options = {}) {
  const app = express(),
    server = http.createServer(app),
    io = new Server(server, {
      maxHttpBufferSize: 4096,
      transports: ["websocket", "polling"],
    }),
    rooms = new Map();
  const clock = options.clock || Date.now,
    countdownMs = options.countdownMs ?? config.countdownMs,
    graceMs = options.graceMs ?? config.graceMs;
  const validator = createValidator();
  const makeCourse = () =>
    validator.generate(randomSeed(), options.courseConfig || {});
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.get("/health", (_req, res) =>
    res.json({ ok: true, version: 3, rooms: rooms.size }),
  );
  app.use(express.static(__dirname + "/public"));
  const cleanName = (n) =>
    typeof n === "string"
      ? n
          .trim()
          .replace(/[<>\x00-\x1f]/g, "")
          .slice(0, 20) || "Pilot"
      : "Pilot";
  function active(r) {
    return r.players.filter((p) => r.roster.includes(p.id) && !p.forfeited);
  }
  function ranking(r) {
    return r.players
      .filter((p) => r.roster.includes(p.id))
      .slice()
      .sort(
        (a, b) =>
          Number(a.forfeited) - Number(b.forfeited) ||
          (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) ||
          b.x - a.x ||
          a.slot - b.slot,
      )
      .map((p) => p.id);
  }
  function canStart(r) {
    const connected = r.players.filter((p) => p.connected);
    return (
      ["lobby", "results"].includes(r.phase) &&
      connected.length >= 2 &&
      connected.every((p) => p.ready)
    );
  }
  function snapshot(r) {
    return {
      code: r.code,
      capacity: r.capacity,
      hostId: r.hostId,
      phase: r.phase,
      startAt: r.startAt,
      serverNow: clock(),
      raceTime: r.raceTime,
      courseSeed: r.course.seed,
      winner: r.winner,
      winnerIds: r.winnerIds,
      reason: r.reason,
      race: r.race,
      roster: r.roster,
      ranking: r.finalRanking || ranking(r),
      results: r.results || null,
      canStart: canStart(r) && !r.starting,
      preparing: !!r.starting,
      players: r.players.map(
        ({
          id,
          name,
          slot,
          connected,
          ready,
          x,
          y,
          vy,
          checkpoint,
          crashes,
          respawnUntil,
          invulnerableUntil,
          finishTime,
          inputSeq,
          forfeited,
        }) => ({
          id,
          name,
          slot,
          color: PALETTE[slot],
          connected,
          ready,
          x,
          y,
          vy,
          checkpoint,
          crashes,
          respawnUntil,
          invulnerableUntil,
          finishTime,
          inputSeq,
          forfeited,
        }),
      ),
    };
  }
  function broadcast(r) {
    io.to(r.code).emit("state", snapshot(r));
  }
  function transferHost(r) {
    if (!r.players.some((p) => p.id === r.hostId && p.connected))
      r.hostId = r.players.find((p) => p.connected)?.id || null;
  }
  function finish(r, winners, reason) {
    r.phase = "results";
    r.winnerIds = winners.map((p) => p.id);
    r.winner = r.winnerIds.length === 1 ? r.winnerIds[0] : null;
    r.reason = reason;
    r.updated = clock();
    r.finalRanking = ranking(r);
    r.results = r.finalRanking.map((id, index) => {
      const p = r.players.find((q) => q.id === id);
      return {
        id: p.id,
        name: p.name,
        color: PALETTE[p.slot],
        x: p.x,
        finishTime: p.finishTime,
        crashes: p.crashes,
        forfeited: p.forfeited,
        rank: r.winnerIds.includes(id) ? 1 : index + 1,
      };
    });
    r.players.forEach((p) => (p.ready = false));
    broadcast(r);
  }
  function maybeForfeit(r) {
    if (r.phase !== "race") return;
    const eligible = active(r);
    if (eligible.length <= 1)
      finish(
        r,
        eligible.filter((p) => p.connected),
        eligible.length
          ? "Last eligible pilot — forfeit victory"
          : "No eligible pilots remain",
      );
  }
  function cancelCountdown(r) {
    r.phase = "lobby";
    r.roster = [];
    r.players.forEach((p) => (p.ready = false));
  }
  function leavePlayer(r, p) {
    if (r.phase === "countdown") cancelCountdown(r);
    if (r.phase === "race" || r.phase === "results") {
      p.forfeited = true;
      p.connected = false;
      p.ready = false;
      p.disconnectedAt = clock() - graceMs;
    } else r.players = r.players.filter((q) => q !== p);
    transferHost(r);
    maybeForfeit(r);
    r.updated = clock();
    broadcast(r);
    if (
      !r.players.some(
        (q) =>
          q.connected || (!q.forfeited && clock() - q.disconnectedAt < graceMs),
      )
    )
      rooms.delete(r.code);
  }
  io.on("connection", (socket) => {
    let entering = false;
    let room = null,
      player = null,
      budget = 40,
      refill = clock();
    const ack = (cb, result) => {
      if (typeof cb === "function") cb(result);
    };
    socket.use((_packet, next) => {
      const now = clock();
      budget = Math.min(40, budget + (now - refill) * 0.025);
      refill = now;
      if (budget < 1) return next(new Error("Too many requests"));
      budget--;
      next();
    });
    socket.on("enter", async (data = {}, cb) => {
      if (room || entering)
        return ack(cb, { error: "You are already in a room or joining one." });
      if (!data || typeof data !== "object")
        return ack(cb, { error: "Invalid request." });
      const code =
        typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
      let r;
      if (data.create) {
        const capacity = data.capacity === undefined ? 3 : data.capacity;
        if (!Number.isInteger(capacity) || capacity < 2 || capacity > 8)
          return ack(cb, {
            error: "Room capacity must be an integer from 2 to 8.",
          });
        if (rooms.size >= 1000)
          return ack(cb, { error: "Server is full. Try again later." });
        let c;
        let course;
        try {
          entering = true;
          course = await makeCourse();
        } catch {
          return ack(cb, {
            error:
              "Course validation failed or server is busy. Please retry or review difficulty configuration.",
          });
        } finally {
          entering = false;
        }
        if (!socket.connected) return;
        if (rooms.size >= 1000)
          return ack(cb, { error: "Server is full. Try again later." });
        do {
          c = randomBytes(3).toString("hex").toUpperCase();
        } while (rooms.has(c));
        r = {
          code: c,
          capacity,
          hostId: null,
          players: [],
          phase: "lobby",
          startAt: 0,
          raceTime: 0,
          winner: null,
          winnerIds: [],
          reason: null,
          race: 0,
          roster: [],
          course,
          updated: clock(),
        };
        rooms.set(c, r);
      } else {
        if (!/^[A-F0-9]{6}$/.test(code))
          return ack(cb, { error: "Enter a valid six-character room code." });
        r = rooms.get(code);
        if (!r)
          return ack(cb, {
            error: "Room not found or expired. Create a new room.",
          });
      }
      let p =
        typeof data.token === "string"
          ? r.players.find((q) => q.token === data.token)
          : null;
      if (p?.connected)
        return ack(cb, {
          error: "This pilot is already connected in another tab.",
        });
      if (p && (p.forfeited || clock() - p.disconnectedAt >= graceMs))
        return ack(cb, {
          error:
            "Your reconnect grace period has expired. Wait for the next race or create a room.",
        });
      if (!p) {
        if (r.phase !== "lobby")
          return ack(cb, {
            error:
              "Race in progress or awaiting rematch. Ask the host to open the lobby.",
          });
        if (r.players.length >= r.capacity)
          return ack(cb, {
            error: `This room is full (${r.capacity} pilots maximum).`,
          });
        const slot = Array.from({ length: 8 }, (_, i) => i).find(
          (i) => !r.players.some((q) => q.slot === i),
        );
        p = {
          id: randomBytes(8).toString("hex"),
          token: randomBytes(24).toString("hex"),
          name: cleanName(data.name),
          slot,
          connected: true,
          ready: false,
        };
        resetPlayer(p, r.course);
        r.players.push(p);
        // Any roster change requires fresh readiness acknowledgements.
        r.players.forEach((q) => (q.ready = false));
      }
      p.connected = true;
      p.disconnectedAt = null;
      p.socket = socket.id;
      room = r;
      player = p;
      if (!r.hostId) r.hostId = p.id;
      transferHost(r);
      socket.join(r.code);
      r.updated = clock();
      ack(cb, {
        id: p.id,
        token: p.token,
        code: r.code,
        course: r.course,
        state: snapshot(r),
      });
      broadcast(r);
    });
    socket.on("ready", (data = {}, cb) => {
      if (!room || !player) return ack(cb, { error: "Join a room first." });
      if (!["lobby", "results"].includes(room.phase) || player.forfeited)
        return ack(cb, { error: "Readiness is locked during a race." });
      // Idempotent desired state prevents a double click from silently cancelling readiness.
      player.ready =
        typeof data?.ready === "boolean" ? data.ready : !player.ready;
      room.updated = clock();
      broadcast(room);
      ack(cb, { ok: true, ready: player.ready });
    });
    socket.on("start", async (_, cb) => {
      if (!room || player?.id !== room.hostId)
        return ack(cb, { error: "Only the host can start the race." });
      if (!canStart(room))
        return ack(cb, {
          error: "At least two connected pilots must all be ready.",
        });
      const r = room;
      if (r.starting)
        return ack(cb, { error: "A course is already being prepared." });
      if (r.race > 0) {
        let next;
        try {
          r.starting = true;
          broadcast(r);
          next = await makeCourse();
        } catch {
          return ack(cb, { error: "Could not validate a new course." });
        } finally {
          r.starting = false;
        }
        if (
          room !== r ||
          rooms.get(r.code) !== r ||
          !socket.connected ||
          r.hostId !== player?.id ||
          !canStart(r)
        )
          return ack(cb, {
            error: "Lobby changed while preparing. Ready up and start again.",
          });
        r.course = next;
        r.players = r.players.filter((p) => p.connected);
      } else r.players = r.players.filter((p) => p.connected);
      r.finalRanking = null;
      r.results = null;
      r.race++;
      r.phase = "countdown";
      r.startAt = clock() + countdownMs;
      r.raceTime = 0;
      r.winner = null;
      r.winnerIds = [];
      r.reason = null;
      r.roster = r.players.map((p) => p.id);
      r.updated = clock();
      r.players.forEach((p) => {
        resetPlayer(p, r.course);
        p.ready = false;
      });
      io.to(r.code).emit("course", r.course);
      broadcast(r);
      ack(cb, { ok: true, startAt: r.startAt });
    });
    socket.on("openLobby", (_, cb) => {
      if (!room || player?.id !== room.hostId || room.phase !== "results")
        return ack(cb, {
          error: "Only the host can reopen the lobby after a race.",
        });
      room.players = room.players.filter((p) => p.connected);
      room.players.forEach((p) => {
        p.ready = false;
        p.forfeited = false;
      });
      room.phase = "lobby";
      room.roster = [];
      room.finalRanking = null;
      room.results = null;
      room.updated = clock();
      broadcast(room);
      ack(cb, { ok: true });
    });
    socket.on("flap", (data) => {
      if (
        room?.phase === "race" &&
        room.roster.includes(player?.id) &&
        player.connected &&
        !player.forfeited
      )
        flap(player, clock(), data?.seq, room.course);
    });
    socket.on("rename", (name, cb) => {
      if (player && room?.phase === "lobby") {
        player.name = cleanName(name);
        broadcast(room);
        ack(cb, { ok: true, name: player.name });
      } else ack(cb, { error: "Names can be changed in the lobby." });
    });
    socket.on("leave", (_, cb) => {
      if (room && player) {
        const r = room,
          p = player;
        socket.leave(r.code);
        room = null;
        player = null;
        leavePlayer(r, p);
      }
      ack(cb, { ok: true });
    });
    socket.on("pingClock", (_, cb) => ack(cb, { now: clock() }));
    socket.on("disconnect", () => {
      if (!room || !player || !room.players.includes(player)) return;
      player.connected = false;
      player.ready = false;
      player.disconnectedAt = clock();
      if (room.phase === "countdown") cancelCountdown(room);
      transferHost(room);
      broadcast(room);
    });
  });
  let previous = clock(),
    accumulator = 0,
    ticks = 0,
    simulationNow = previous;
  function tick() {
    const now = clock(),
      delta = Math.max(0, now - previous);
    previous = now;
    // Bound catch-up work. Wall-clock countdown and simulated motion use separate clocks.
    accumulator += Math.min(250, delta);
    simulationNow = Math.max(simulationNow, now - 250);
    for (const r of rooms.values()) {
      for (const p of [...r.players])
        if (!p.connected && !p.forfeited && now - p.disconnectedAt >= graceMs) {
          if (r.phase === "race" || r.phase === "results") p.forfeited = true;
          else r.players = r.players.filter((q) => q !== p);
        }
      transferHost(r);
      maybeForfeit(r);
      if (
        !r.players.length ||
        (!r.players.some((p) => p.connected) &&
          r.players.every(
            (p) => p.forfeited || now - p.disconnectedAt >= graceMs,
          ))
      ) {
        rooms.delete(r.code);
        continue;
      }
      if (r.phase === "countdown" && now >= r.startAt) r.phase = "race";
      if (
        r.phase === "race" &&
        now - r.startAt > Math.max(300000, r.course.durationSeconds * 3000)
      )
        finish(r, [], "Race time limit reached");
      if (r.phase !== "race" && now - r.updated > config.roomIdleMs) {
        io.to(r.code).emit("expired");
        rooms.delete(r.code);
        io.in(r.code).disconnectSockets(true);
      }
    }
    while (accumulator >= 1000 / 60) {
      accumulator -= 1000 / 60;
      simulationNow += 1000 / 60;
      for (const r of rooms.values())
        if (r.phase === "race" && simulationNow >= r.startAt) {
          r.raceTime += 1 / 60;
          const finishers = [];
          for (const p of active(r)) {
            if (!p.connected) continue;
            const event = stepPlayer(
              p,
              1 / 60,
              simulationNow,
              r.course,
              r.raceTime,
            );
            if (event === "finish") {
              p.finishTime =
                r.raceTime - (p.x - r.course.finish) / r.course.speed;
              finishers.push(p);
            }
          }
          if (finishers.length) {
            finishers.sort((a, b) => a.finishTime - b.finishTime);
            const first = finishers[0].finishTime,
              winners = finishers.filter(
                (p) => Math.abs(p.finishTime - first) < 1e-6,
              );
            finish(
              r,
              winners,
              winners.length > 1
                ? "Photo finish — dead heat"
                : "Finish line crossed",
            );
          }
        }
    }
    if (++ticks % 3 === 0) for (const r of rooms.values()) broadcast(r);
  }
  const interval = options.manual ? null : setInterval(tick, 1000 / 60);
  return {
    app,
    server,
    io,
    rooms,
    tick,
    close: () =>
      new Promise((resolve) => {
        clearInterval(interval);
        validator.close();
        io.close(() => server.close(() => resolve()));
      }),
  };
}
if (require.main === module) {
  const game = createGameServer();
  game.server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
    console.log(`Flappy Maze Race v3 listening on ${process.env.PORT || 3000}`),
  );
}
module.exports = { createGameServer };
