const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { errorHandler } = require("@reloop/shared");
const { createPasswordResetRouter } = require("./passwordResetRoutes");
const { REQUEST_ACCEPTED_MESSAGE } = require("./passwordResetController");
const { enabledConfig } = require("./testSupport");

/** Counts like Redis INCR, keyed exactly as the limiter keys them. */
function fakeRedis() {
  const counts = new Map();
  return {
    keys: () => [...counts.keys()],
    async eval(_script, _numKeys, key) {
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts.get(key);
    },
  };
}

function buildApp({ service = {}, config = enabledConfig, rateLimitClient = fakeRedis() } = {}) {
  const calls = [];
  const fullService = {
    requestReset: async (input) => calls.push(["requestReset", input]),
    verifyToken: async () => ({ expiresAt: "2026-10-21T10:30:00.000Z" }),
    resetPassword: async (input) => calls.push(["resetPassword", input]),
    ...service,
  };
  const app = express();
  app.set("trust proxy", "loopback");
  app.use(express.json());
  app.use("/password", createPasswordResetRouter({ service: fullService, config, rateLimitClient }));
  app.use(errorHandler);
  return { app, calls, rateLimitClient };
}

test("forgot answers 202 with the same message for any email", async () => {
  const { app, calls } = buildApp();
  const res = await request(app).post("/password/forgot").send({ email: "a@example.com" });
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { message: REQUEST_ACCEPTED_MESSAGE });
  assert.equal(calls[0][1].email, "a@example.com");
});

test("forgot is limited per email, case-insensitively, across IPs", async () => {
  const { app } = buildApp();
  const send = (email, ip) =>
    request(app).post("/password/forgot").set("X-Forwarded-For", ip).send({ email });

  for (let i = 0; i < enabledConfig.request.perEmail; i++) {
    assert.equal((await send("Victim@Example.com", `203.0.113.${i}`)).status, 202);
  }
  const blocked = await send("victim@example.com ", "203.0.113.99");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers["retry-after"], String(enabledConfig.request.windowSeconds));
});

test("forgot is limited per client IP across many emails", async () => {
  const { app } = buildApp();
  for (let i = 0; i < enabledConfig.request.perIp; i++) {
    const res = await request(app)
      .post("/password/forgot")
      .set("X-Forwarded-For", "198.51.100.7")
      .send({ email: `user${i}@example.com` });
    assert.equal(res.status, 202);
  }
  const res = await request(app)
    .post("/password/forgot")
    .set("X-Forwarded-For", "198.51.100.7")
    .send({ email: "one-more@example.com" });
  assert.equal(res.status, 429);
});

test("rate-limit keys never contain the raw email or IP", async () => {
  const { app, rateLimitClient } = buildApp();
  await request(app)
    .post("/password/forgot")
    .set("X-Forwarded-For", "198.51.100.7")
    .send({ email: "private@example.com" });
  const keys = rateLimitClient.keys().join(" ");
  assert.ok(!keys.includes("private@example.com"));
  assert.ok(!keys.includes("198.51.100.7"));
});

test("if Redis is unreachable the endpoints refuse instead of running unmetered", async () => {
  const { app, calls } = buildApp({
    rateLimitClient: { eval: async () => { throw new Error("ECONNREFUSED"); } },
  });
  const res = await request(app).post("/password/forgot").send({ email: "a@example.com" });
  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);
});

test("verify returns the expiry and reset returns 204", async () => {
  const { app, calls } = buildApp();
  const verified = await request(app).post("/password/reset/verify").send({ token: "t" });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.expiresAt, "2026-10-21T10:30:00.000Z");

  const reset = await request(app)
    .post("/password/reset")
    .send({ token: "t", password: "brand-new-pass-1" });
  assert.equal(reset.status, 204);
  assert.deepEqual(calls[0], [
    "resetPassword",
    { token: "t", password: "brand-new-pass-1", ipAddress: "::ffff:127.0.0.1" },
  ]);
});

test("verify and reset share one per-IP attempt budget", async () => {
  const { app } = buildApp();
  for (let i = 0; i < enabledConfig.submit.perIp; i++) {
    await request(app).post(i % 2 ? "/password/reset" : "/password/reset/verify").send({ token: "t" });
  }
  const res = await request(app).post("/password/reset/verify").send({ token: "t" });
  assert.equal(res.status, 429);
});

test("service errors keep their status and code", async () => {
  const { app } = buildApp({
    service: {
      verifyToken: async () => {
        throw Object.assign(new Error("This reset link is invalid or has expired."), {
          status: 400,
          code: "RESET_TOKEN_INVALID",
        });
      },
    },
  });
  const res = await request(app).post("/password/reset/verify").send({ token: "t" });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "RESET_TOKEN_INVALID");
});
