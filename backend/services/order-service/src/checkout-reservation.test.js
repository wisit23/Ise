const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET = "checkout-reservation-test-secret";
process.env.JWT_REFRESH_SECRET = "checkout-reservation-refresh-secret";
process.env.DATABASE_URL ||=
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const { signAccessToken } = require("@reloop/shared");
const orderModel = require("./models/orderModel");
const productClient = require("./services/productClient");
const app = require("./app");

const buyerToken = signAccessToken({ sub: "buyer-a", role: "BUYER" });
const expiresAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();

test("checkout persists the reservation identity returned by product-service", async (t) => {
  t.mock.method(productClient, "reserveProduct", async () => ({
    reservationId: "reservation-a",
    reservedBy: "buyer-a",
    expiresAt,
    product: {
      id: "product-a",
      sellerId: "seller-a",
      title: "Test product",
      price: 500,
      status: "reserved",
    },
  }));
  t.mock.method(orderModel, "create", async (data) => ({
    id: "order-a",
    status: "pending",
    ...data,
  }));

  const response = await request(app)
    .post("/")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ productId: "product-a" });

  assert.equal(response.status, 201);
  assert.equal(response.body.reservationId, "reservation-a");
  assert.equal(response.body.reservationExpiresAt, expiresAt);
});

test("checkout releases the exact reservation when Order creation fails", async (t) => {
  t.mock.method(console, "error", () => {});
  t.mock.method(productClient, "reserveProduct", async () => ({
    reservationId: "reservation-b",
    reservedBy: "buyer-a",
    expiresAt,
    product: {
      id: "product-b",
      sellerId: "seller-a",
      title: "Test product",
      price: 500,
      status: "reserved",
    },
  }));
  t.mock.method(orderModel, "create", async () => {
    throw new Error("simulated Order database failure");
  });

  const releases = [];
  t.mock.method(
    productClient,
    "releaseReservation",
    async (productId, reservationId, buyerId) => {
      releases.push({ productId, reservationId, buyerId });
    },
  );

  const response = await request(app)
    .post("/")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ productId: "product-b" });

  assert.equal(response.status, 500);
  assert.deepEqual(releases, [
    {
      productId: "product-b",
      reservationId: "reservation-b",
      buyerId: "buyer-a",
    },
  ]);
});
