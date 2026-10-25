const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "purchase-history-test-secret";
const { signAccessToken } = require("@reloop/shared");
const {
  createRecommendationHistoryRoutes,
} = require("./recommendationHistoryRoutes");

test("purchase history is private, scoped to bearer buyer, paid and excludes cancelled/refunded orders", async () => {
  let query;
  const app = express();
  app.locals.validateAccessSession = async () => ({});
  app.use(
    createRecommendationHistoryRoutes({
      order: {
        findMany: async (args) => {
          query = args;
          return [
            {
              productId: "purchased",
              payments: [{ paidAt: new Date("2026-10-14") }],
            },
          ];
        },
      },
    }),
  );
  assert.equal((await request(app).get("/")).status, 401);
  const token = signAccessToken({ sub: "buyer", role: "BUYER" });
  const res = await request(app)
    .get("/?buyerId=victim")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(query.where.buyerId, "buyer");
  assert.deepEqual(query.where.status.in, [
    "paid",
    "confirmed",
    "ready_to_ship",
    "pickup_in_progress",
    "in_transit",
    "delivered",
    "completed",
  ]);
  assert.equal(query.where.payments.some.paymentStatus, "paid");
  assert.equal(query.take, 50);
  assert.deepEqual(Object.keys(res.body.items[0]).sort(), [
    "productId",
    "purchasedAt",
  ]);
  assert.equal(res.headers["cache-control"], "private, no-store");
});
