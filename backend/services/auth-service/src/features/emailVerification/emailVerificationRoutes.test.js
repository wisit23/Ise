const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { errorHandler } = require("@reloop/shared");
const { createEmailVerificationRouter } = require("./emailVerificationRoutes");
const { RESEND_ACCEPTED_MESSAGE } = require("./emailVerificationController");
const { verificationConfig, fakeRedis } = require("../../test/fakes");

function buildApp({ service = {}, rateLimitClient = fakeRedis() } = {}) {
  const calls = [];
  const app = express();
  app.set("trust proxy", "loopback");
  app.use(express.json());
  app.use(
    "/email",
    createEmailVerificationRouter({
      service: {
        resend: async (input) => calls.push(["resend", input]),
        verify: async (token) => calls.push(["verify", token]),
        ...service,
      },
      config: verificationConfig,
      rateLimitClient,
    }),
  );
  app.use(errorHandler);
  return { app, calls };
}

test("resend answers 202 with the same message for any email", async () => {
  const { app, calls } = buildApp();
  const res = await request(app).post("/email/resend").send({ email: "a@example.com" });
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { message: RESEND_ACCEPTED_MESSAGE });
  assert.equal(calls[0][1].email, "a@example.com");
});

test("resend is limited per email across IPs", async () => {
  const { app } = buildApp();
  const send = (ip) =>
    request(app).post("/email/resend").set("X-Forwarded-For", ip).send({ email: "Me@Example.com" });
  for (let i = 0; i < verificationConfig.resend.perEmail; i++) {
    assert.equal((await send(`203.0.113.${i}`)).status, 202);
  }
  assert.equal((await send("203.0.113.200")).status, 429);
});

test("verify returns 204 and passes the token through", async () => {
  const { app, calls } = buildApp();
  const res = await request(app).post("/email/verify").send({ token: "tok" });
  assert.equal(res.status, 204);
  assert.deepEqual(calls[0], ["verify", "tok"]);
});

test("verify is limited per client IP", async () => {
  const { app } = buildApp();
  for (let i = 0; i < verificationConfig.submit.perIp; i++) {
    await request(app).post("/email/verify").send({ token: "tok" });
  }
  const res = await request(app).post("/email/verify").send({ token: "tok" });
  assert.equal(res.status, 429);
});

test("an invalid link keeps its status and code", async () => {
  const { app } = buildApp({
    service: {
      verify: async () => {
        throw Object.assign(new Error("invalid"), {
          status: 400,
          code: "VERIFICATION_TOKEN_INVALID",
        });
      },
    },
  });
  const res = await request(app).post("/email/verify").send({ token: "tok" });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "VERIFICATION_TOKEN_INVALID");
});
