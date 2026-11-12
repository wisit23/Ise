const http = require("node:http");
const { backgroundWorkersEnabled } = require("./backgroundWorkers");

function startPeriodicTask(
  task,
  intervalMs,
  { immediate = false, delayMs, onError = console.error } = {},
) {
  let active = null;
  let stopped = false;
  let delayed;
  const run = () => {
    if (stopped || active) return active;
    active = Promise.resolve()
      .then(task)
      .catch(onError)
      .finally(() => {
        active = null;
      });
    return active;
  };
  const timer = setInterval(() => {
    if (!delayed) void run();
  }, intervalMs);
  timer.unref();
  if (delayMs !== undefined) {
    delayed = setTimeout(() => {
      delayed = null;
      void run();
    }, delayMs);
    delayed.unref();
  } else if (immediate) void run();
  timer.stop = async () => {
    stopped = true;
    clearInterval(timer);
    clearTimeout(delayed);
    await active;
  };
  return timer;
}

function createServiceRuntime({
  app,
  service,
  checks = [],
  shutdownMs = Number(process.env.SHUTDOWN_TIMEOUT_MS || 30000),
  probeMs = 2000,
}) {
  if (!Number.isFinite(shutdownMs) || shutdownMs <= 0)
    throw new Error("SHUTDOWN_TIMEOUT_MS must be positive");
  let draining = false;
  let closing;
  let probing;
  const workers = [];
  const resources = [];
  const drains = [];
  const workerMode = backgroundWorkersEnabled();
  const sockets = new Set();
  const responses = new Set();
  const server = http.createServer(async (req, res) => {
    responses.add(res);
    res.once("close", () => responses.delete(res));
    const path = req.url.split("?")[0];
    if (path === "/ready" || draining) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      if (draining) {
        res.setHeader("Connection", "close");
        res.statusCode = 503;
        return res.end(JSON.stringify({ status: "draining", service }));
      }
      if (!probing) {
        // Keep one actual probe in flight even after HTTP callers time out.
        probing = Promise.all(
          checks.map((check) => Promise.resolve().then(check)),
        )
          .then(
            () => true,
            () => false,
          )
          .finally(() => {
            probing = null;
          });
      }
      let timeout;
      const ready = await Promise.race([
        probing,
        new Promise((resolve) => {
          timeout = setTimeout(() => resolve(false), probeMs);
        }),
      ]);
      clearTimeout(timeout);
      res.statusCode = ready && !draining ? 200 : 503;
      return res.end(
        JSON.stringify({
          status: res.statusCode === 200 ? "ready" : "not_ready",
          service,
          release: process.env.RELEASE_ID,
          deploymentSlot: process.env.DEPLOYMENT_SLOT || "blue",
          backgroundWorkersEnabled: workerMode,
        }),
      );
    }
    app(req, res);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const runHooks = async (hooks) => {
    const results = await Promise.allSettled(
      hooks.map((hook) => Promise.resolve().then(hook)),
    );
    for (const result of results)
      if (result.status === "rejected") throw result.reason;
  };
  function shutdown() {
    if (closing) return closing;
    draining = true;
    for (const res of responses) {
      if (
        String(res.getHeader("Content-Type") || "").startsWith(
          "text/event-stream",
        )
      )
        res.end();
    }
    closing = (async () => {
      const deadline = setTimeout(() => {
        for (const socket of sockets) socket.destroy();
        process.exit(1);
      }, shutdownMs);
      try {
        const closed = new Promise((resolve, reject) =>
          server.close((error) => {
            if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
            else resolve();
          }),
        );
        // Stop new background work while HTTP and long-lived transports drain.
        const stopped = runHooks(workers);
        await Promise.all([closed, stopped, runHooks(drains)]);
        await runHooks(resources);
      } finally {
        clearTimeout(deadline);
      }
    })();
    return closing;
  }
  function installSignals() {
    const handler = (signal) => {
      console.log(`[${service}] ${signal}: draining`);
      shutdown().then(
        () => process.exit(0),
        (error) => {
          console.error(`[${service}] shutdown failed:`, error);
          process.exit(1);
        },
      );
    };
    process.once("SIGTERM", handler);
    process.once("SIGINT", handler);
  }
  return {
    server,
    shutdown,
    installSignals,
    isDraining: () => draining,
    addWorker: (stop) => workers.push(stop),
    addResource: (close) => resources.push(close),
    addDrain: (close) => drains.push(close),
  };
}

module.exports = { createServiceRuntime, startPeriodicTask };
