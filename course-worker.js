"use strict";
const { parentPort, workerData } = require("node:worker_threads");
try {
  parentPort.postMessage({
    course: require("./game").createCourse(
      workerData.seed,
      workerData.overrides,
    ),
  });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
