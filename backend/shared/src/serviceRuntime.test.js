const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { createServiceRuntime, startPeriodicTask } = require("./serviceRuntime");

async function listen(runtime) {
  runtime.server.listen(0, "127.0.0.1");
  await once(runtime.server, "listening");
  return `http://127.0.0.1:${runtime.server.address().port}`;
}

test("readiness checks dependencies without changing existing health or routes", async (t) => {
  let healthy = true;
  const runtime = createServiceRuntime({
    service: "test",
    app: (req, res) => res.end("existing"),
    checks: [
      async () => {
        if (!healthy) throw new Error("private connection details");
      },
    ],
  });
  const url = await listen(runtime);
  t.after(() => runtime.shutdown());
  assert.equal((await fetch(`${url}/ready`)).status, 200);
  healthy = false;
  const failed = await fetch(`${url}/ready`);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), {
    status: "not_ready",
    service: "test",
  });
  assert.equal(await (await fetch(`${url}/health`)).text(), "existing");
});

test("hung readiness probes time out without multiplying pending work", async (t) => {
  let calls = 0;
  let finish;
  const runtime = createServiceRuntime({
    service: "test",
    app: () => {},
    probeMs: 15,
    checks: [
      () => {
        calls++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    ],
  });
  const url = await listen(runtime);
  t.after(() => runtime.shutdown());
  assert.equal((await fetch(`${url}/ready`)).status, 503);
  assert.equal((await fetch(`${url}/ready`)).status, 503);
  assert.equal(calls, 1);
  finish();
});

test("shutdown waits for active HTTP and workers before closing resources, once", async () => {
  let releaseRequest;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  const events = [];
  let releaseWorker;
  const runtime = createServiceRuntime({
    service: "test",
    app: async (req, res) => {
      entered();
      await waiting;
      res.end("completed");
      events.push("request");
    },
  });
  runtime.addWorker(async () => {
    await new Promise((resolve) => {
      releaseWorker = resolve;
    });
    events.push("worker");
  });
  runtime.addResource(() => {
    events.push("resource");
  });
  const url = await listen(runtime);
  const response = fetch(`${url}/work`);
  await started;
  const closing = runtime.shutdown();
  assert.equal(runtime.isDraining(), true);
  assert.equal(runtime.shutdown(), closing);
  await delay(10);
  assert.deepEqual(events, []);
  releaseRequest();
  releaseWorker();
  assert.equal(await (await response).text(), "completed");
  await closing;
  assert.equal(events.at(-1), "resource");
  assert.equal(events.filter((event) => event === "resource").length, 1);
});

test("periodic workers do not overlap and stop waits for the current attempt", async () => {
  let calls = 0;
  let finish;
  const timer = startPeriodicTask(
    () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    5,
    { immediate: true },
  );
  await delay(20);
  assert.equal(calls, 1);
  let stopped = false;
  const stopping = timer.stop().then(() => {
    stopped = true;
  });
  await delay(10);
  assert.equal(stopped, false);
  finish();
  await stopping;
  await delay(15);
  assert.equal(calls, 1);
});

test("shutdown closes a long-lived SSE response without waiting for the deadline", async () => {
  const runtime = createServiceRuntime({ service: "sse", app: (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.write("event: ready\ndata: {}\n\n");
  } });
  const url = await listen(runtime);
  const response = await fetch(url);
  await runtime.shutdown();
  assert.match(await response.text(), /event: ready/);
});

test("stopping a delayed worker cancels its first run", async () => {
  let calls = 0;
  const timer = startPeriodicTask(
    () => {
      calls++;
    },
    10,
    { delayMs: 20 },
  );
  await timer.stop();
  await delay(30);
  assert.equal(calls, 0);
});
