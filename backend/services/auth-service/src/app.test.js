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

test("POST /kyc with no bearer token is rejected with 401", async () => {
  const res = await request(app).post("/kyc").send({});
  assert.equal(res.status, 401);
});

test("GET /kyc/status with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/kyc/status");
  assert.equal(res.status, 401);
});

