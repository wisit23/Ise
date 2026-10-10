const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const productController = require("./productController");
const productModel = require("../models/productModel");
const auctionRepository = require("../features/auctions/auctionRepository");
const sellerActivityClient = require("../services/sellerActivityClient");

beforeEach((t) => {
  t.mock.method(auctionRepository, "withProductLock", async (_id, fn) =>
    fn({}),
  );
  t.mock.method(
    auctionRepository,
    "findActiveAuctionByProductId",
    async () => null,
  );
});

test("relistAvailable rejects non-owner seller", async (t) => {
  t.mock.method(productModel, "findById", async () => ({
    id: "prod-1",
    sellerId: "other-seller",
    status: "auction_action_required",
  }));

  const req = {
    params: { id: "prod-1" },
    userId: "seller-1",
    body: { price: 500 },
  };
  let errorCaught = null;
  const res = {};
  const next = (err) => {
    errorCaught = err;
  };

  await productController.relistAvailable(req, res, next);
  assert.ok(errorCaught);
  assert.equal(errorCaught.status, 403);
});

test("relistAvailable rejects products not in auction_action_required status", async (t) => {
  t.mock.method(productModel, "findById", async () => ({
    id: "prod-1",
    sellerId: "seller-1",
    status: "available",
  }));

  const req = {
    params: { id: "prod-1" },
    userId: "seller-1",
    body: { price: 500 },
  };
  let errorCaught = null;
  const res = {};
  const next = (err) => {
    errorCaught = err;
  };

  await productController.relistAvailable(req, res, next);
  assert.ok(errorCaught);
  assert.equal(errorCaught.status, 400);
  assert.ok(errorCaught.message.includes("รอการดำเนินการหลังประมูล"));
});

test("relistAvailable rejects when an active auction item exists for the product", async (t) => {
  t.mock.method(productModel, "findById", async () => ({
    id: "prod-1",
    sellerId: "seller-1",
    status: "auction_action_required",
  }));
  t.mock.method(
    auctionRepository,
    "findActiveAuctionByProductId",
    async () => ({
      id: "auction-active-1",
      productId: "prod-1",
      status: "pending_approval",
    }),
  );

  const req = {
    params: { id: "prod-1" },
    userId: "seller-1",
    body: { price: 500 },
  };
  let errorCaught = null;
  await productController.relistAvailable(req, {}, (err) => {
    errorCaught = err;
  });

  assert.ok(errorCaught);
  assert.equal(errorCaught.status, 400);
  assert.ok(errorCaught.message.includes("รายการประมูลที่ยังดำเนินการอยู่"));
});

test("relistAvailable validates positive integer price", async (t) => {
  t.mock.method(productModel, "findById", async () => ({
    id: "prod-1",
    sellerId: "seller-1",
    status: "auction_action_required",
  }));

  // Decimal price
  let errorCaught = null;
  await productController.relistAvailable(
    { params: { id: "prod-1" }, userId: "seller-1", body: { price: 99.99 } },
    {},
    (err) => {
      errorCaught = err;
    },
  );
  assert.ok(errorCaught);
  assert.equal(errorCaught.status, 400);
  assert.ok(errorCaught.message.includes("จำนวนเต็มบวก"));

  // Negative price
  errorCaught = null;
  await productController.relistAvailable(
    { params: { id: "prod-1" }, userId: "seller-1", body: { price: -500 } },
    {},
    (err) => {
      errorCaught = err;
    },
  );
  assert.ok(errorCaught);
  assert.equal(errorCaught.status, 400);

  // Zero price
  errorCaught = null;
  await productController.relistAvailable(
    { params: { id: "prod-1" }, userId: "seller-1", body: { price: 0 } },
    {},
    (err) => {
      errorCaught = err;
    },
  );
  assert.ok(errorCaught);
  assert.equal(errorCaught.status, 400);
});

test("relistAvailable updates product to available and refreshes seller activity", async (t) => {
  t.mock.method(productModel, "findById", async () => ({
    id: "prod-1",
    sellerId: "seller-1",
    status: "auction_action_required",
  }));

  let updatedData = null;
  t.mock.method(productModel, "update", async (id, data) => {
    updatedData = { id, ...data };
    return updatedData;
  });

  let activityRecordedSeller = null;
  t.mock.method(sellerActivityClient, "recordActivity", (sellerId) => {
    activityRecordedSeller = sellerId;
  });

  let jsonResult = null;
  const res = {
    json: (data) => {
      jsonResult = data;
    },
  };

  await productController.relistAvailable(
    { params: { id: "prod-1" }, userId: "seller-1", body: { price: 750 } },
    res,
    () => {},
  );

  assert.ok(jsonResult);
  assert.equal(jsonResult.id, "prod-1");
  assert.equal(jsonResult.price, 750);
  assert.equal(jsonResult.status, "available");
  assert.equal(updatedData.price, 750);
  assert.equal(updatedData.status, "available");
  assert.equal(activityRecordedSeller, "seller-1");
});
