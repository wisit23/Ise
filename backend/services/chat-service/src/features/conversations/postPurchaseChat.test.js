const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
const { requireAuth, signAccessToken, errorHandler } = require("@reloop/shared");
const controller = require("./conversationController");
const model = require("./conversationModel");

// Exercise the public controller and auth without requiring Mongo or Redis.
const app = express();
app.use(express.json());
app.locals.validateAccessSession = async () => {};
app.post("/conversations", requireAuth, controller.create);
app.use(errorHandler);

function fixture(t) {
  t.mock.method(model, "restoreForParticipant", async () => ({ count: 0 }));
  t.mock.method(global, "fetch", async (url) => {
    if (String(url).endsWith("/order-1/internal")) return {
      ok: true,
      json: async () => ({ buyerId: "buyer", sellerId: "seller", productId: "product" }),
    };
    if (String(url).endsWith("/product")) return {
      ok: true,
      json: async () => ({ id: "product", sellerId: "seller", status: "sold" }),
    };
    throw new Error(`Unexpected URL: ${url}`);
  });
  let room = null;
  t.mock.method(model, "findByContextKey", async () => room);
  t.mock.method(model, "create", async (data) => {
    room = { ...data };
    return room;
  });
}

const body = { contextType: "PRODUCT", productId: "product", orderId: "order-1" };
function send(userId, payload = body) {
  return request(app).post("/conversations")
    .set("Authorization", `Bearer ${signAccessToken({ sub: userId, role: "BUYER" })}`)
    .send(payload);
}

test("purchaser opens a sold listing chat and repeated clicks reuse the same room", async (t) => {
  fixture(t);
  const first = await send("buyer", { ...body, sellerId: "forged", buyerId: "forged" });
  assert.equal(first.status, 201);
  assert.equal(first.body.contextKey, "PRODUCT:product:buyer");
  assert.deepEqual(first.body.participants.map((p) => p.userId), ["buyer", "seller"]);
  const second = await send("buyer");
  assert.equal(second.status, 201);
  assert.equal(second.body.id, first.body.id);
  assert.equal(model.create.mock.callCount(), 1);
});

test("another buyer cannot use the purchaser's order", async (t) => {
  fixture(t);
  assert.equal((await send("stranger")).status, 403);
  assert.equal(model.create.mock.callCount(), 0);
});

test("seller opens the order buyer's room and both parties reuse it", async (t) => {
  fixture(t);
  const seller = await send("seller", { ...body, buyerId: "forged" });
  assert.equal(seller.status, 201);
  assert.equal(seller.body.contextKey, "PRODUCT:product:buyer");
  assert.equal(seller.body.createdBy, "seller");
  assert.deepEqual(seller.body.participants.map((p) => [p.userId, p.role]), [
    ["buyer", "BUYER"], ["seller", "SELLER"],
  ]);
  assert.equal((await send("buyer")).body.id, seller.body.id);
  assert.equal((await send("seller")).body.id, seller.body.id);
  assert.equal(model.create.mock.callCount(), 1);
});

test("seller cannot start a chat on their listing without a verified order", async (t) => {
  fixture(t);
  assert.equal((await send("seller", { contextType: "PRODUCT", productId: "product" })).status, 400);
  assert.equal(model.create.mock.callCount(), 0);
});

test("seller cannot substitute another product for an order", async (t) => {
  fixture(t);
  t.mock.method(global, "fetch", async (url) => {
    if (String(url).endsWith("/order-1/internal")) return {
      ok: true, json: async () => ({ buyerId: "buyer", sellerId: "seller", productId: "other" }),
    };
    return { ok: true, json: async () => ({ sellerId: "seller", status: "sold" }) };
  });
  assert.equal((await send("seller")).status, 403);
  assert.equal(model.create.mock.callCount(), 0);
});

test("sold listing still blocks a new chat without an order", async (t) => {
  fixture(t);
  assert.equal((await send("buyer", { contextType: "PRODUCT", productId: "product" })).status, 400);
  assert.equal(model.create.mock.callCount(), 0);
});

test("a guest cannot contact the seller through an order", async (t) => {
  fixture(t);
  assert.equal((await request(app).post("/conversations").send(body)).status, 401);
  assert.equal(model.create.mock.callCount(), 0);
});

for (const orderId of [null, "", 42, {}]) {
  test(`invalid order ID ${JSON.stringify(orderId)} is rejected`, async (t) => {
    fixture(t);
    assert.equal((await send("buyer", { ...body, orderId })).status, 400);
    assert.equal(model.create.mock.callCount(), 0);
  });
}

test("an order-service outage does not grant chat access", async (t) => {
  fixture(t);
  t.mock.method(global, "fetch", async (url) => {
    if (String(url).endsWith("/product")) return {
      ok: true, json: async () => ({ sellerId: "seller", status: "sold" }),
    };
    throw new Error("order-service offline");
  });
  assert.equal((await send("buyer")).status, 503);
  assert.equal(model.create.mock.callCount(), 0);
});
