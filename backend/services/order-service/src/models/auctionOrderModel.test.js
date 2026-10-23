const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("./prismaClient");
const orderModel = require("./orderModel");

function orderRow(overrides = {}) {
  return {
    id: "order-b",
    checkoutId: null,
    basketId: null,
    buyerId: "buyer-b",
    sellerId: "seller-1",
    productId: "product-1",
    productTitle: "สินค้าประมูล",
    campaignId: null,
    auctionId: "auction-1",
    auctionBidId: "bid-b-900",
    paymentDeadlineAt: new Date("2026-10-18T12:00:00.000Z"),
    orderType: "AUCTION",
    originalAmount: 900,
    ordersAmount: 900,
    status: "pending_payment",
    version: 1,
    basket: null,
    checkout: null,
    shipping: null,
    dispute: null,
    payments: [],
    ...overrides,
  };
}

test("createAuctionOrder creates one immutable order and its creation log in the same transaction", async (t) => {
  const logs = [];
  const row = orderRow();
  const tx = {
    order: {
      findUnique: async () => null,
      create: async ({ data }) => ({ ...row, ...data }),
    },
    orderLog: {
      create: async ({ data }) => {
        logs.push(data);
        return data;
      },
    },
  };
  t.mock.method(prisma, "$transaction", async (fn) => fn(tx));

  const result = await orderModel.createAuctionOrder(row, {
    previousOrderId: "order-a",
  });

  assert.equal(result.created, true);
  assert.equal(result.order.buyerId, "buyer-b");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, "AUCTION_ORDER_CREATED");
  assert.match(logs[0].detail, /"previousOrderId":"order-a"/);
});

test("createAuctionOrder retry returns the deterministic existing order without a duplicate log", async (t) => {
  const row = orderRow();
  let logWrites = 0;
  const tx = {
    order: {
      findUnique: async () => row,
      create: async () => {
        throw new Error("retry must not create a duplicate order");
      },
    },
    orderLog: {
      create: async () => {
        logWrites += 1;
      },
    },
  };
  t.mock.method(prisma, "$transaction", async (fn) => fn(tx));

  const result = await orderModel.createAuctionOrder(row, {
    previousOrderId: "order-a",
  });

  assert.equal(result.created, false);
  assert.equal(result.order.id, "order-b");
  assert.equal(logWrites, 0);
});

test("finalizeExpiredAuctionOrder keeps the cancelled order owner and records the successor without mutating ownership", async (t) => {
  const before = orderRow({
    id: "order-a",
    buyerId: "buyer-a",
    auctionBidId: "bid-a-1000",
    status: "cancelled",
    version: 2,
  });
  const logs = [];
  let update = null;
  let reads = 0;
  const tx = {
    order: {
      findUnique: async () => {
        reads += 1;
        return reads === 1
          ? before
          : { ...before, paymentDeadlineAt: null, version: 3 };
      },
      updateMany: async (args) => {
        update = args;
        return { count: 1 };
      },
    },
    orderLog: {
      create: async ({ data }) => {
        logs.push(data);
        return data;
      },
    },
  };
  t.mock.method(prisma, "$transaction", async (fn) => fn(tx));

  const finalized = await orderModel.finalizeExpiredAuctionOrder({
    id: "order-a",
    expectedVersion: 2,
    successorOrder: {
      id: "order-b",
      buyerId: "buyer-b",
      auctionBidId: "bid-b-900",
      price: 900,
      paymentDeadlineAt: new Date("2026-10-18T12:00:00.000Z"),
    },
  });

  assert.equal(finalized.buyerId, "buyer-a");
  assert.equal(finalized.status, "cancelled");
  assert.equal(finalized.paymentDeadlineAt, null);
  assert.deepEqual(update.data, {
    paymentDeadlineAt: null,
    version: { increment: 1 },
  });
  assert.equal(logs[0].action, "AUCTION_WINNER_REASSIGNED");
  assert.match(logs[0].detail, /"nextOrderId":"order-b"/);
});

test("finalizeExpiredAuctionOrder retry does not write another rollover log", async (t) => {
  const finalized = orderRow({
    id: "order-a",
    buyerId: "buyer-a",
    status: "cancelled",
    paymentDeadlineAt: null,
    version: 3,
  });
  let writes = 0;
  const tx = {
    order: {
      findUnique: async () => finalized,
      updateMany: async () => {
        throw new Error("finalized retry must not update the order again");
      },
    },
    orderLog: {
      create: async () => {
        writes += 1;
      },
    },
  };
  t.mock.method(prisma, "$transaction", async (fn) => fn(tx));

  const result = await orderModel.finalizeExpiredAuctionOrder({
    id: "order-a",
    expectedVersion: 3,
    successorOrder: { id: "order-b" },
  });

  assert.equal(result.id, "order-a");
  assert.equal(writes, 0);
});
