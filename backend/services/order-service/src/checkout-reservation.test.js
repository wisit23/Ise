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
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

const buyerToken = signAccessToken({ sub: "buyer-a", role: "BUYER" });
const sellerToken = signAccessToken({ sub: "seller-b", role: "SELLER" });
const executiveToken = signAccessToken({
  sub: "executive-a",
  role: "EXECUTIVE",
});
const expiresAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();

test("checkout persists the reservation identity returned by product-service", async (t) => {
  t.mock.method(productClient, "reserveProduct", async () => ({
    created: true,
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
  t.mock.method(orderModel, "findByReservationId", async () => null);
  t.mock.method(orderModel, "create", async (data) => ({
    id: "order-a",
    status: "pending",
    ...data,
  }));
  t.mock.method(orderModel, "findByReservationId", async () => null);

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
    created: true,
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
  t.mock.method(orderModel, "findByReservationId", async () => null);
  t.mock.method(orderModel, "create", async () => {
    throw new Error("simulated Order database failure");
  });
  t.mock.method(orderModel, "findByReservationId", async () => null);

  const releases = [];
  t.mock.method(
    productClient,
    "releaseProductReservation",
    async (productId, reservationId) => {
      releases.push({ productId, reservationId });
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
    },
  ]);
});

test("a seller account may buy another seller's product", async (t) => {
  t.mock.method(productClient, "reserveProduct", async () => ({
    created: true,
    reservationId: "reservation-seller-b",
    expiresAt,
    product: {
      id: "product-other-shop",
      sellerId: "seller-a",
      title: "Other shop product",
      price: 750,
    },
  }));
  t.mock.method(orderModel, "findByReservationId", async () => null);
  t.mock.method(orderModel, "create", async (data) => ({
    id: "order-s",
    ...data,
  }));

  const response = await request(app)
    .post("/")
    .set("Authorization", `Bearer ${sellerToken}`)
    .send({ productId: "product-other-shop" });

  assert.equal(response.status, 201);
  assert.equal(response.body.buyerId, "seller-b");
});

test("a staff account is denied before product-service is called", async (t) => {
  const reserve = t.mock.method(productClient, "reserveProduct", async () => {
    throw new Error("must not be called");
  });

  const response = await request(app)
    .post("/")
    .set("Authorization", `Bearer ${executiveToken}`)
    .send({ productId: "product-a" });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "CUSTOMER_ACCOUNT_REQUIRED");
  assert.equal(reserve.mock.callCount(), 0);
});
