"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const { createGameServer } = require("../server");
const E = require("../game");
const flush = () => new Promise((r) => setTimeout(r, 2));
const emit = (s, event, data = {}) =>
  new Promise((resolve, reject) =>
    s
      .timeout(3000)
      .emit(event, data, (err, res) => (err ? reject(err) : resolve(res))),
  );
async function fixture(t, capacity = 3) {
  let now = 10000;
  const game = createGameServer({ manual: true, clock: () => now });
  await new Promise((r) => game.server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${game.server.address().port}`,
    clients = [];
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    await game.close();
  });
  async function connect() {
    const s = io(url, {
      forceNew: true,
      transports: ["websocket"],
      reconnection: false,
    });
    clients.push(s);
    await new Promise((resolve, reject) => {
      s.once("connect", resolve);
      s.once("connect_error", reject);
    });
    s.on("state", (state) => (s.latest = state));
    s.on("course", (course) => (s.course = course));
    return s;
  }
  const host = await connect(),
    hr = await emit(host, "enter", { create: true, capacity, name: "Host" });
  assert.ok(!hr.error, hr.error);
  host.identity = hr;
  host.course = hr.course;
  const room = game.rooms.get(hr.code);
  async function join(name = "Pilot") {
    const s = await connect();
    const r = await emit(s, "enter", { code: hr.code, name });
    s.identity = r;
    s.course = r.course;
    assert.ok(!r.error, r.error);
    return s;
  }
  async function advance(ms) {
    const steps = Math.ceil(ms / (1000 / 60));
    for (let i = 0; i < steps; i++) {
      now += ms / steps;
      game.tick();
    }
    await flush();
  }
  async function start(players) {
    for (const s of players) await emit(s, "ready", { ready: true });
    const result = await emit(host, "start");
    assert.ok(result.ok, result.error);
    await flush();
    await advance(3020);
    assert.equal(room.phase, "race");
  }
  return {
    game,
    url,
    host,
    room,
    hr,
    clients,
    connect,
    join,
    advance,
    start,
    get now() {
      return now;
    },
  };
}
for (const n of [2, 3, 4, 8])
  test(`${n} independent players: lobby, readiness, start, inputs, winner and rematch`, async (t) => {
    const f = await fixture(t, n),
      players = [f.host];
    for (let i = 1; i < n; i++) players.push(await f.join("Pilot " + i));
    await flush();
    for (const s of players) {
      assert.equal(s.latest.players.length, n);
      assert.equal(new Set(s.latest.players.map((p) => p.color)).size, n);
      assert.deepEqual(s.course, f.host.course);
      assert.equal(s.latest.hostId, f.hr.id);
    }
    const extra = await f.connect();
    assert.match(
      (await emit(extra, "enter", { code: f.hr.code })).error,
      /full/,
    );
    assert.match((await emit(players[1], "start")).error, /host/);
    assert.match((await emit(f.host, "start")).error, /ready/);
    for (const s of players) await emit(s, "ready", { ready: true });
    assert.equal(f.room.phase, "lobby");
    await flush();
    for (const s of players) assert.ok(s.latest.players.every((p) => p.ready));
    await emit(f.host, "start");
    await flush();
    for (const s of players) {
      assert.equal(s.latest.phase, "countdown");
      assert.equal(s.latest.startAt, f.room.startAt);
      assert.equal(s.latest.roster.length, n);
    }
    const late = await f.connect();
    assert.match(
      (await emit(late, "enter", { code: f.hr.code })).error,
      /progress/,
    );
    f.host.emit("flap", { seq: 1, x: 999999 });
    await flush();
    assert.equal(f.room.players[0].x, 100); // input is locked before GO
    await f.advance(3020);
    for (let i = 0; i < n; i++) {
      const otherVy = f.room.players.filter((_, j) => j !== i).map((p) => p.vy);
      players[i].emit("flap", { seq: 1, x: 999999, finishTime: 0 });
      await flush();
      assert.equal(f.room.players[i].vy, f.room.course.flap);
      assert.deepEqual(
        f.room.players.filter((_, j) => j !== i).map((p) => p.vy),
        otherVy,
      );
    }
    // Collision affects only its pilot.
    const unaffected = f.room.players.slice(1).map((p) => p.x);
    f.room.players[0].y = 0;
    await f.advance(20);
    assert.equal(f.room.players[0].crashes, 1);
    f.room.players.slice(1).forEach((p, i) => assert.ok(p.x > unaffected[i]));
    // Isolated server fixture for boundary/ordering, never an exposed client teleport API.
    const ranked = f.room.players;
    ranked.forEach((p, i) => {
      p.x = f.room.course.finish - 60 - i * 15;
      p.y = 270;
      p.vy = 0;
      p.respawnUntil = 0;
    });
    ranked[1].x = f.room.course.finish - 1;
    await f.advance(20);
    assert.equal(f.room.phase, "results");
    await flush();
    for (const s of players) {
      assert.equal(s.latest.winner, players[1].identity.id);
      assert.equal(s.latest.ranking[0], players[1].identity.id);
      assert.equal(s.latest.players[0].finishTime, null);
    }
    const seed = f.room.course.seed;
    for (const s of players) await emit(s, "ready", { ready: true });
    await emit(f.host, "start");
    await flush();
    assert.equal(f.room.phase, "countdown");
    assert.equal(f.room.race, 2);
    assert.notEqual(f.room.course.seed, seed);
    assert.ok(f.room.players.every((p) => p.x === 100 && p.crashes === 0));
    for (const s of players) assert.equal(s.course.seed, f.room.course.seed);
  });
test("eight-seat room starts with three ready pilots; original ready UX remains explicit", async (t) => {
  const f = await fixture(t, 8),
    b = await f.join("B"),
    c = await f.join("C");
  await emit(f.host, "ready", { ready: true });
  await flush();
  assert.equal(f.host.latest.players.find((p) => p.id === f.hr.id).ready, true);
  assert.equal(f.host.latest.canStart, false);
  assert.equal(f.room.phase, "lobby");
  await f.start([f.host, b, c]);
  assert.equal(f.room.roster.length, 3);
});
test("full three-client race completes through legal inputs with consistent final results", async (t) => {
  const f = await fixture(t, 3),
    b = await f.join("B"),
    c = await f.join("C");
  await f.start([f.host, b, c]);
  const initial = { ...f.room.players[0] };
  const plan = E.planCourse(f.room.course, {
    startState: initial,
    delaySeconds: f.room.raceTime,
  });
  assert.ok(plan.ok);
  let seq = 0,
    next = 0;
  for (let tick = 0; tick < 120 * 60 && f.room.phase === "race"; tick++) {
    const frame = Math.round(
      ((f.room.players[0].x - initial.x) / f.room.course.speed) * 60,
    );
    if (plan.flaps[next] !== undefined && plan.flaps[next] <= frame) {
      f.host.emit("flap", { seq: ++seq });
      next++;
      await flush();
    }
    await f.advance(1000 / 60);
  }
  assert.equal(f.room.phase, "results");
  assert.equal(f.room.winner, f.hr.id);
  assert.equal(f.room.players[0].crashes, 0);
  assert.ok(
    f.room.players[0].finishTime >= 89 && f.room.players[0].finishTime < 91,
  );
  for (const s of [f.host, b, c]) {
    assert.equal(s.latest.winner, f.hr.id);
    assert.deepEqual(s.latest.ranking, f.host.latest.ranking);
    assert.ok(s.latest.players.slice(1).every((p) => p.crashes > 0));
  }
});
test("three-player disconnect, token reconnection, expiry and last-pilot forfeits", async (t) => {
  const f = await fixture(t, 3),
    b = await f.join("B"),
    c = await f.join("C");
  await f.start([f.host, b, c]);
  const before = f.room.players[1].x;
  b.disconnect();
  await flush();
  await f.advance(500);
  assert.equal(f.room.phase, "race");
  assert.equal(f.room.players[1].x, before);
  const recovered = await f.connect();
  const r = await emit(recovered, "enter", {
    code: f.hr.code,
    token: b.identity.token,
  });
  assert.equal(r.id, b.identity.id);
  assert.equal(r.state.players[1].x, before);
  const dup = await f.connect();
  assert.match(
    (await emit(dup, "enter", { code: f.hr.code, token: b.identity.token }))
      .error,
    /another tab/,
  );
  c.disconnect();
  await flush();
  await f.advance(30010);
  assert.equal(f.room.phase, "race");
  assert.equal(f.room.players[2].forfeited, true);
  await emit(recovered, "leave");
  await flush();
  assert.equal(f.room.phase, "results");
  assert.equal(f.room.winner, f.hr.id);
});
test("host transfers, disconnect cancels countdown, and empty rooms clean up", async (t) => {
  const f = await fixture(t, 3),
    b = await f.join("B"),
    c = await f.join("C");
  await emit(f.host, "leave");
  await flush();
  assert.equal(f.room.hostId, b.identity.id);
  assert.equal(f.room.players.length, 2);
  await emit(b, "ready", { ready: true });
  await emit(c, "ready", { ready: true });
  await emit(b, "start");
  assert.equal(f.room.phase, "countdown");
  c.disconnect();
  await flush();
  assert.equal(f.room.phase, "lobby");
  assert.equal(f.room.players[0].ready, false);
  b.disconnect();
  await flush();
  await f.advance(30010);
  assert.equal(f.game.rooms.has(f.hr.code), false);
});
test("capacity validation, names, unknown codes, isolated rooms and reopening lobby", async (t) => {
  const f = await fixture(t, 8),
    s = await f.connect();
  for (const capacity of [1, 9, 3.5, "3", null])
    assert.match(
      (await emit(s, "enter", { create: true, capacity })).error,
      /capacity/,
    );
  assert.match((await emit(s, "enter", { code: "X" })).error, /valid/);
  const unknown = f.hr.code === "ABCDEF" ? "123456" : "ABCDEF";
  assert.match((await emit(s, "enter", { code: unknown })).error, /not found/);
  const separate = await emit(s, "enter", {
    create: true,
    capacity: 2,
    name: "<test>",
  });
  assert.notEqual(separate.code, f.hr.code);
  assert.equal(f.game.rooms.get(separate.code).players.length, 1);
  assert.equal(f.game.rooms.get(separate.code).players[0].name, "test");
  const b = await f.join("B");
  await emit(b, "rename", "A new callsign");
  await flush();
  assert.equal(f.host.latest.players[1].name, "A new callsign");
  await f.start([f.host, b]);
  await emit(b, "leave");
  assert.equal(f.room.phase, "results");
  await emit(f.host, "openLobby");
  assert.equal(f.room.phase, "lobby");
  const newcomer = await f.join("New");
  assert.ok(newcomer.identity.id);
  assert.equal(f.room.players.length, 2);
});
test("exact multiway ties and final leaderboard ordering", async (t) => {
  const f = await fixture(t, 3),
    b = await f.join("B"),
    c = await f.join("C");
  await f.start([f.host, b, c]);
  f.room.players.forEach((p) =>
    Object.assign(p, { x: f.room.course.finish - 1, y: 270, vy: 0 }),
  );
  await f.advance(20);
  assert.equal(f.room.winner, null);
  assert.equal(f.room.winnerIds.length, 3);
  assert.match(f.room.reason, /dead heat/);
  assert.equal(new Set(f.room.players.map((p) => p.finishTime)).size, 1);
});

test("final results stay frozen after departures, and reopening preserves a fresh next-race seed", async (t) => {
  const f = await fixture(t, 3),
    b = await f.join("B"),
    c = await f.join("C");
  await f.start([f.host, b, c]);
  Object.assign(f.room.players[0], {
    x: f.room.course.finish - 1,
    y: 270,
    vy: 0,
  });
  await f.advance(20);
  assert.equal(f.room.phase, "results");
  const result = JSON.stringify(f.room.results),
    order = [...f.room.finalRanking],
    oldSeed = f.room.course.seed;
  await emit(f.host, "leave");
  await flush();
  assert.equal(JSON.stringify(f.room.results), result);
  assert.deepEqual(f.room.finalRanking, order);
  assert.equal(f.room.hostId, b.identity.id);
  await emit(b, "openLobby");
  assert.equal(f.room.players.length, 2);
  await emit(b, "ready", { ready: true });
  await emit(c, "ready", { ready: true });
  await emit(b, "start");
  assert.equal(f.room.phase, "countdown");
  assert.notEqual(f.room.course.seed, oldSeed);
  c.disconnect();
  await flush();
  await f.advance(1800001);
  assert.equal(f.game.rooms.has(f.hr.code), false);
});

test("a roster change during asynchronous rematch validation cannot start a stale race", async (t) => {
  const f = await fixture(t, 3),
    b = await f.join("B"),
    c = await f.join("C");
  await f.start([f.host, b, c]);
  Object.assign(f.room.players[0], {
    x: f.room.course.finish - 1,
    y: 270,
    vy: 0,
  });
  await f.advance(20);
  assert.equal(f.room.phase, "results");
  for (const s of [f.host, b, c]) await emit(s, "ready", { ready: true });
  const starting = emit(f.host, "start");
  await flush();
  await emit(b, "ready", { ready: false });
  const outcome = await starting;
  assert.match(outcome.error, /changed/);
  assert.equal(f.room.phase, "results");
  assert.equal(f.room.race, 1);
});
