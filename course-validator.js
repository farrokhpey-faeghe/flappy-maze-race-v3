"use strict";
// Keep trajectory search off the authoritative simulation's event loop.
const { Worker } = require("node:worker_threads");
const path = require("node:path");
function createValidator() {
  const queue = [],
    active = new Set();
  let closed = false;
  function pump() {
    while (!closed && active.size < 2 && queue.length) {
      const job = queue.shift();
      let finished = false;
      const worker = new Worker(path.join(__dirname, "course-worker.js"), {
        workerData: job.data,
      });
      const entry = { worker, fail: (error) => done(error) };
      active.add(entry);
      const timer = setTimeout(() => {
        worker.terminate();
        done(new Error("Course validation timed out"));
      }, 10000);
      function done(error, result) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        active.delete(entry);
        if (error) job.reject(error);
        else job.resolve(result);
        pump();
      }
      worker.once("message", (message) =>
        done(message.error ? new Error(message.error) : null, message.course),
      );
      worker.once("error", done);
      worker.once("exit", (code) => {
        if (!finished) done(new Error("Course worker exited " + code));
      });
    }
  }
  return {
    generate(seed, overrides = {}) {
      return new Promise((resolve, reject) => {
        if (closed) return reject(new Error("Server shutting down"));
        if (queue.length >= 12)
          return reject(new Error("Course validation queue is full"));
        queue.push({ data: { seed, overrides }, resolve, reject });
        pump();
      });
    },
    close() {
      closed = true;
      for (const job of queue.splice(0))
        job.reject(new Error("Server shutting down"));
      for (const entry of [...active]) {
        entry.worker.terminate();
        entry.fail(new Error("Server shutting down"));
      }
    },
  };
}
module.exports = { createValidator };
