"use strict";
// Code-level frontend tests. This DOM/canvas harness is not a substitute for browser QA.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Engine = require("../game");
function harness() {
  const handlers = {},
    sent = [],
    elements = new Map();
  let frame,
    now = 10000;
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const context = new Proxy(
    { createLinearGradient: () => gradient },
    { get: (target, key) => (key in target ? target[key] : noop) },
  );
  function node(id = "") {
    const classes = new Set(id === "home" ? [] : ["hidden"]);
    return {
      id,
      children: [],
      value: id === "capacity" ? "8" : "Pilot",
      disabled: false,
      clientWidth: 1100,
      clientHeight: 480,
      width: 0,
      height: 0,
      style: { setProperty: noop },
      classList: {
        add: (x) => classes.add(x),
        remove: (x) => classes.delete(x),
        toggle: (x, flag) => {
          if (flag) classes.add(x);
          else classes.delete(x);
        },
        contains: (x) => classes.has(x),
      },
      append(...nodes) {
        this.children.push(...nodes);
      },
      replaceChildren(...nodes) {
        this.children = nodes;
      },
      setAttribute: noop,
      addEventListener(event, fn) {
        this[event] = fn;
      },
      focus: noop,
      getContext: () => context,
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
    };
  }
  const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
  for (const match of html.matchAll(/id="([^"]+)"/g))
    elements.set(match[1], node(match[1]));
  const c = Engine.createCourse(123),
    players = Array.from({ length: 3 }, (_, slot) => {
      const p = {
        id: "p" + slot,
        name: "Pilot " + slot,
        slot,
        color: Engine.PALETTE[slot],
        connected: true,
        ready: false,
      };
      Engine.resetPlayer(p, c);
      return p;
    });
  let state = {
    code: "ABC123",
    capacity: 8,
    hostId: "p0",
    phase: "lobby",
    startAt: 13000,
    serverNow: 10000,
    raceTime: 0,
    courseSeed: c.seed,
    race: 0,
    winner: null,
    winnerIds: [],
    roster: [],
    ranking: [],
    canStart: false,
    players,
  };
  const socket = {
    connected: true,
    on(event, fn) {
      handlers[event] = fn;
    },
    timeout() {
      return this;
    },
    emit(event, data, cb) {
      sent.push({ event, data });
      if (event === "enter")
        cb(null, {
          id: "p0",
          code: state.code,
          token: "test",
          course: c,
          state,
        });
      if (event === "ready") {
        players[0].ready = data.ready;
        handlers.state(state);
        cb(null, { ok: true });
      }
      if (event === "start") cb?.(null, { ok: true });
    },
  };
  const window = {
    FlappyEngine: Engine,
    addEventListener(event, fn) {
      handlers[event] = fn;
    },
  };
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const sandbox = {
    window,
    document: {
      activeElement: null,
      getElementById(id) {
        assert.ok(elements.has(id), "unknown DOM id " + id);
        return elements.get(id);
      },
      createElement: () => node(),
    },
    io: () => socket,
    performance: { now: () => now },
    Date: Clock,
    devicePixelRatio: 1,
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    history: { replaceState: noop },
    location: { origin: "http://localhost:3000", search: "" },
    navigator: { clipboard: { writeText: async () => {} } },
    URLSearchParams,
    requestAnimationFrame: (fn) => {
      frame = fn;
    },
    setInterval: noop,
    setTimeout: noop,
    clearTimeout: noop,
    prompt: noop,
    confirm: () => true,
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../public/app.js"), "utf8"),
    sandbox,
  );
  return {
    elements,
    handlers,
    sent,
    players,
    course: c,
    enter() {
      elements.get("create").onclick();
    },
    receive(update) {
      state = { ...state, ...update };
      handlers.state(state);
    },
    draw() {
      frame(now);
    },
    advance(ms) {
      now += ms;
    },
  };
}
test("frontend wiring renders the 3-player/8-seat lobby and gives immediate Ready feedback", () => {
  const h = harness();
  h.draw();
  h.enter();
  assert.equal(h.sent[0].data.capacity, 8);
  assert.equal(h.elements.get("pilots").children.length, 3);
  assert.equal(h.elements.get("playerCount").textContent, "Players: 3 / 8");
  assert.equal(h.elements.get("start").disabled, true);
  h.elements.get("ready").onclick();
  assert.equal(h.players[0].ready, true);
  assert.match(h.elements.get("ready").textContent, /Ready ✓/);
  assert.equal(h.elements.get("ready").disabled, false);
  assert.equal(h.elements.get("start").disabled, true);
  h.players.forEach((p) => (p.ready = true));
  h.receive({ canStart: true });
  assert.equal(h.elements.get("start").disabled, false);
  assert.match(h.elements.get("lobbyStatus").textContent, /Click Start/);
  h.elements.get("start").onclick();
  assert.equal(h.sent.at(-1).event, "start");
});
test("keyboard, pointer/touch handler, race rendering and results execute without runtime errors", () => {
  const h = harness();
  h.enter();
  h.receive({
    phase: "countdown",
    race: 1,
    roster: ["p0", "p1", "p2"],
    ranking: ["p1", "p0", "p2"],
  });
  h.draw();
  assert.equal(h.elements.get("countdown").textContent, "3");
  let prevented = false;
  h.handlers.keydown({
    code: "Space",
    repeat: false,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(h.sent.filter((s) => s.event === "flap").length, 0);
  h.advance(3020);
  h.receive({ phase: "race", raceTime: 0.02, serverNow: 13020 });
  h.draw();
  h.handlers.keydown({ code: "Space", repeat: false, preventDefault() {} });
  assert.equal(h.sent.at(-1).event, "flap");
  assert.equal(h.sent.at(-1).data.seq, 1);
  h.advance(120);
  h.elements.get("gameCanvas").pointerdown({ preventDefault() {} });
  assert.equal(h.sent.at(-1).data.seq, 2);
  const count = h.sent.length;
  h.handlers.keydown({ code: "Space", repeat: true, preventDefault() {} });
  assert.equal(h.sent.length, count);
  assert.equal(h.elements.get("progress").children.length, 3);
  assert.match(h.elements.get("intensity").textContent, /Easy/);
  h.receive({
    phase: "results",
    winner: "p1",
    winnerIds: ["p1"],
    reason: "Finish line crossed",
    ranking: ["p1", "p0", "p2"],
  });
  h.draw();
  assert.match(h.elements.get("winner").textContent, /Pilot 1 takes/);
  assert.equal(h.elements.get("resultRows").children.length, 3);
});
