const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET = "cart-route-test-secret";
const { signAccessToken, errorHandler } = require("@reloop/shared");
const { randomUUID } = require("node:crypto");
const cart = require("./cartService");

test("cart HTTP routes preserve buyer identity and separate reservation from order creation", async (t) => {
  const calls = [];
  t.mock.method(cart, "createCartService", () => ({
    add: async (input) => {
      calls.push(["add", input]);
      return { id: "basket", orderId: null };
    },
    list: async (input) => {
      calls.push(["list", input]);
      return { items: [], total: 0 };
    },
    prepare: async (input) => {
      calls.push(["prepare", input]);
      return { items: [{ id: "order" }] };
    },
    remove: async (input) => {
      calls.push(["remove", input]);
    },
  }));
  const app = express();
  app.use(express.json());
  app.locals.validateAccessSession = async () => {};
  app.use("/cart", require("./cartRoutes"));
  app.use(errorHandler);
  const buyerId = randomUUID();
  const token = signAccessToken({ sub: buyerId, role: "BUYER" });
  const authorization = `Bearer ${token}`;
  assert.equal((await request(app).get("/cart")).status, 401);
  assert.equal(
    (
      await request(app)
        .post("/cart")
        .set("Authorization", authorization)
        .send({
          productId: "product",
          campaignId: "voucher",
          buyerId: "spoofed",
        })
    ).status,
    201,
  );
  assert.deepEqual(calls[0], [
    "add",
    { buyerId, productId: "product", campaignId: "voucher" },
  ]);
  assert.equal(
    (await request(app).get("/cart").set("Authorization", authorization))
      .status,
    200,
  );
  const response = await request(app)
    .post("/cart/prepare")
    .set("Authorization", authorization)
    .send({ basketIds: ["basket"], buyerId: "spoofed" });
  assert.equal(response.status, 200);
  assert.equal(response.body.items[0].id, "order");
  assert.deepEqual(calls[2], ["prepare", { buyerId, basketIds: ["basket"] }]);
  assert.equal(
    (
      await request(app)
        .delete("/cart/basket")
        .set("Authorization", authorization)
    ).status,
    204,
  );
  assert.deepEqual(calls[3], ["remove", { buyerId, basketId: "basket" }]);
  const staff = signAccessToken({ sub: randomUUID(), role: "EXECUTIVE" });
  assert.equal(
    (
      await request(app)
        .post("/cart/prepare")
        .set("Authorization", `Bearer ${staff}`)
        .send({ basketIds: ["basket"] })
    ).status,
    403,
  );
  assert.equal(calls.length, 4);
});
