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
  assert.equal(res.body.service, "order-service");
});

test("GET /mine with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/mine");
  assert.equal(res.status, 401);
});

test("POST / with no bearer token is rejected with 401", async () => {
  const res = await request(app).post("/").send({ productId: "p1" });
  assert.equal(res.status, 401);
});

test("GET /selling with no bearer token is rejected with 401", async () => {
  const res = await request(app).get("/selling");
  assert.equal(res.status, 401);
});

test("PATCH /:id/pay with no bearer token is rejected with 401", async () => {
  const res = await request(app).patch("/o1/pay");
  assert.equal(res.status, 401);
});
