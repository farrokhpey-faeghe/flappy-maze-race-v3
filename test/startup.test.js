"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
test("production entry starts and serves the frontend, shared engine and Socket.IO client", async (t) => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, PORT: "3219" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Server startup timeout")),
      6000,
    );
    child.stdout.on("data", (data) => {
      if (String(data).includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code) reject(new Error("Startup exited " + code));
    });
  });
  for (const route of [
    "/",
    "/app.js",
    "/engine.js",
    "/style.css",
    "/socket.io/socket.io.js",
    "/health",
  ]) {
    const r = await fetch("http://127.0.0.1:3219" + route);
    assert.equal(r.status, 200, route);
    if (route === "/health") assert.equal((await r.json()).version, 3);
  }
});
