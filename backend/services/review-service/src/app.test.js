const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.DATABASE_URL ||=
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const app = require("./app");

test("GET /health returns 200 ok without needing a database", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "review-service");
});

test("POST / with no bearer token is rejected with 401", async () => {
  const res = await request(app).post("/").send({ orderId: "o1", rating: 5 });
  assert.equal(res.status, 401);
});

test("GET /mine with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/mine");
  assert.equal(res.status, 401);
});

test("GET /by-order/:orderId with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/by-order/o1");
  assert.equal(res.status, 401);
});
