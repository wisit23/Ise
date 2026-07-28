const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.DATABASE_URL ||=
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const { signAccessToken } = require("@reloop/shared");
const app = require("./app");

const buyerToken = signAccessToken({ sub: "buyer-1", role: "BUYER" });

test("GET /health returns 200 ok without needing a database", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "product-service");
});

test("POST / with no bearer token is rejected with 401", async () => {
  const res = await request(app)
    .post("/")
    .send({ title: "x", price: 100, category: "y" });
  assert.equal(res.status, 401);
});

test("POST / from a BUYER account is rejected with 403 before touching the database", async () => {
  const res = await request(app)
    .post("/")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ title: "x", price: 100, category: "y" });
  assert.equal(res.status, 403);
});
