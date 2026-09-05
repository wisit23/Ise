const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.DATABASE_URL ||=
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const { signAccessToken } = require("@reloop/shared");
const app = require("../src/app");

test("GET /health returns 200 ok without needing a database", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "support-service");
});

test("GET /tickets/mine with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/tickets/mine");
  assert.equal(res.status, 401);
});

test("GET /tickets/queue with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/tickets/queue");
  assert.equal(res.status, 401);
});

test("POST /tickets with no bearer token is rejected with 401", async () => {
  const res = await request(app).post("/tickets").send({ subject: "help" });
  assert.equal(res.status, 401);
});

test("GET /help works for guests (FAQ deflection must not require login)", async () => {
  const res = await request(app).get("/help").query({ q: "test" });
  // Not 401 — public route. (May still 500 without a real DB; that's covered
  // by the integration test, this just proves no auth gate exists here.)
  assert.notEqual(res.status, 401);
});

test("POST /help with a BUYER token is rejected with 403 before touching the database", async () => {
  const token = signAccessToken({ sub: "buyer-1", role: "BUYER" });
  const res = await request(app)
    .post("/help")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "x", body: "y", category: "OTHER" });
  assert.equal(res.status, 403);
});
