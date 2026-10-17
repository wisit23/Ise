const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "checkout-routes-test";
const { signAccessToken, errorHandler } = require("@reloop/shared");
const service = require("./checkoutSessionService");
const routes = require("./checkoutSessionRoutes");
const app = express();
app.locals.validateAccessSession = async () => {};
app.use(express.json());
app.use("/checkout-sessions", routes);
app.use(errorHandler);
const token = signAccessToken({ sub: "buyer-1", role: "BUYER", roles: ["BUYER"] });

test("checkout cancellation requires authentication", async () => {
  const response = await request(app).post("/checkout-sessions/c1/cancel");
  assert.equal(response.status, 401);
});

test("cancel controller uses authenticated buyer rather than spoofed body", async (t) => {
  const original = service.cancel;
  t.after(() => { service.cancel = original; });
  service.cancel = async (args) => {
    assert.deepEqual(args, { buyerId: "buyer-1", sessionId: "c1" });
    return { id: "c1", status: "cancelled" };
  };
  const response = await request(app).post("/checkout-sessions/c1/cancel")
    .set("Authorization", `Bearer ${token}`).send({ buyerId: "other" });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "cancelled");
});

test("address controller forwards only selected id and authenticated identity", async (t) => {
  const original = service.updateAddress;
  t.after(() => { service.updateAddress = original; });
  service.updateAddress = async (args) => {
    assert.equal(args.buyerId, "buyer-1");
    assert.equal(args.sessionId, "c1");
    assert.equal(args.addressId, "a2");
    assert.equal(args.authorization, `Bearer ${token}`);
    return { id: "c1", addressId: "a2" };
  };
  const response = await request(app).patch("/checkout-sessions/c1/address")
    .set("Authorization", `Bearer ${token}`).send({ addressId: "a2", buyerId: "other" });
  assert.equal(response.status, 200);
  assert.equal(response.body.addressId, "a2");
});
