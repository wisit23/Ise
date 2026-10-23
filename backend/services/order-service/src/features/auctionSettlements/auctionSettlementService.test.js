const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAuctionSettlementService,
  AUCTION_PAYMENT_TTL_MS,
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
    reassignAuctionOrder: async (input) => {
      calls.push(input);
      return { ...due, ...input, status: "pending_payment", version: 3 };
    },
    finalizeAuctionOrderWithoutWinner: async () => {
      throw new Error("must not release while another bidder exists");
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
      };
    },
  };
  const notices = [];
  const chat = {
    notifyOrderStatusChanged: async (order, status) => notices.push([status, order.buyerId]),
    notifyOrderPlaced: async (order) => notices.push(["placed", order.buyerId]),
  };
  const service = createAuctionSettlementService({ orders, products, chat, now: () => NOW });

  const result = await service.expireDue({ at: NOW });

  assert.equal(result.processed, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].buyerId, "buyer-b");
  assert.equal(calls[0].auctionBidId, "bid-b-90");
  assert.equal(calls[0].paymentDeadlineAt.getTime(), NOW.getTime() + AUCTION_PAYMENT_TTL_MS);
  assert.deepEqual(notices, [["payment_expired", "buyer-a"], ["placed", "buyer-b"]]);
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
    reassignAuctionOrder: async () => {
      throw new Error("must not reassign without a next bidder");
    },
    finalizeAuctionOrderWithoutWinner: async (input) => {
      finalized = input;
      return { ...cancelled, auctionBidId: null };
    },
  };
  const products = {
    advanceAuctionWinner: async () => ({ outcome: "released" }),
  };
  const chat = {
    notifyOrderStatusChanged: async () => {},
    notifyOrderPlaced: async () => {},
  };
  const service = createAuctionSettlementService({ orders, products, chat, now: () => NOW });

  const result = await service.expireDue({ at: NOW });

  assert.equal(result.processed, 1);
  assert.deepEqual(finalized, { id: "order-1", expectedVersion: 4 });
});
