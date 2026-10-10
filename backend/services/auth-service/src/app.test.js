const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("./app");

test("GET /health returns 200 ok without needing a database", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "auth-service");
});

test("GET /me with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/me");
  assert.equal(res.status, 401);
});

test("GET /me/addresses with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/me/addresses");
  assert.equal(res.status, 401);
});

test("buyer audit self-service routes require authentication", async () => {
  for (const path of ["/me/login-history", "/me/activity"]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401);
  }

  const writeRes = await request(app)
    .post("/me/activity")
    .send({ action: "PRODUCT_VIEWED" });
  assert.equal(writeRes.status, 401);
});

test("buyer activity ingestion requires the internal service token", async () => {
  const res = await request(app)
    .post("/internal/buyer-activity")
    .send({ buyerId: "buyer-1", action: "ORDER_PLACED" });
  assert.equal(res.status, 403);
});
