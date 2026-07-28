const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

// Point proxy targets at a closed local port so any test that reaches the
// proxy layer fails fast (connection refused) instead of hanging on a DNS
// lookup for a Docker-only hostname like "auth-service".
process.env.AUTH_SERVICE_URL = "http://127.0.0.1:1";

const app = require("./app");

test("GET /health returns 200 ok without needing auth", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "gateway");
});

test("a protected route with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/api/orders/mine");
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "Missing bearer token");
});

test("a public auth route is not blocked by the auth check", async () => {
  // No proxy target is running in this test, so we only assert the request
  // was NOT rejected by the gateway's own 401 auth guard (i.e. it was let
  // through to the proxy layer, which then fails trying to reach a real
  // auth-service — that failure is not what this smoke test is proving).
  const res = await request(app).post("/api/auth/login").send({});
  assert.notEqual(res.status, 401);
});
