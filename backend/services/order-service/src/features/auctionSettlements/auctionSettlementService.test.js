const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAuctionSettlementService,
} = require("./auctionSettlementService");

const NOW = new Date("2026-10-16T12:00:00.000Z");

test("TC_AUC10: expired winner becomes payment_expired and the next distinct bidder receives a fresh 24-hour deadline", async () => {
  const calls = [];
  const due = {
    id: "order-1",
    auctionId: "auction-1",
    auctionBidId: "bid-a-100",
    buyerId: "buyer-a",
    status: "pending_payment",
    version: 1,
  };
  const orders = {
    findAuctionOrdersDueForSettlement: async () => [due],
    claimExpiredAuctionOrder: async () => ({ ...due, status: "payment_expired", version: 2 }),
    finalizeExpiredAuctionOrder: async (input) => {
      calls.push(input);
      return { ...due, status: "cancelled", paymentDeadlineAt: null, version: 3 };
    },
  };
  const products = {
    advanceAuctionWinner: async (auctionId, input) => {
      assert.equal(auctionId, "auction-1");
      assert.deepEqual(input, {
        currentBidId: "bid-a-100",
        orderId: "order-1",
        expiredBuyerId: "buyer-a",
      });
      return {
        outcome: "reassigned",
        bidId: "bid-b-90",
        buyerId: "buyer-b",
        price: 90,
        orderId: "order-b",
        paymentDeadlineAt: new Date("2026-10-17T12:00:00.000Z"),
      };
    },
  };
  const notices = [];
  const chat = {
    notifyOrderStatusChanged: async (order, status) => notices.push([status, order.buyerId]),
  };
  const service = createAuctionSettlementService({ orders, products, chat, now: () => NOW });

  const result = await service.expireDue({ at: NOW });

  assert.equal(result.processed, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    id: "order-1",
    expectedVersion: 2,
    successorOrder: {
      id: "order-b",
      buyerId: "buyer-b",
      auctionBidId: "bid-b-90",
      price: 90,
      paymentDeadlineAt: new Date("2026-10-17T12:00:00.000Z"),
    },
  });
  assert.deepEqual(notices, [["payment_expired", "buyer-a"]]);
});

test("TC_AUC10: exhausted ranking releases the product and permanently closes settlement", async () => {
  const cancelled = {
    id: "order-1",
    auctionId: "auction-1",
    auctionBidId: "bid-last",
    buyerId: "buyer-last",
    status: "cancelled",
    version: 4,
  };
  let finalized = null;
  const orders = {
    findAuctionOrdersDueForSettlement: async () => [cancelled],
    claimExpiredAuctionOrder: async () => {
      throw new Error("already claimed order must not be claimed again");
    },
    finalizeExpiredAuctionOrder: async (input) => {
      finalized = input;
      return { ...cancelled, paymentDeadlineAt: null };
    },
  };
  const products = {
    advanceAuctionWinner: async () => ({ outcome: "released" }),
  };
  const service = createAuctionSettlementService({ orders, products, now: () => NOW });

  const result = await service.expireDue({ at: NOW });

  assert.equal(result.processed, 1);
  assert.deepEqual(finalized, { id: "order-1", expectedVersion: 4 });
});
