const orderModel = require("../../models/orderModel");
const productClient = require("../../services/productClient");
const { AUCTION_PAYMENT_TTL_MS } = require("@reloop/shared");

function createAuctionSettlementService({
  orders = orderModel,
  products = productClient,
  now = () => new Date(),
} = {}) {
  let workerTimer = null;
  let sweeping = false;

  async function settleOne(order, settledAt = now()) {
    let claimed = order;
    if (["pending", "pending_payment"].includes(order.status)) {
      claimed = await orders.claimExpiredAuctionOrder({
        id: order.id,
        expectedVersion: order.version,
        now: settledAt,
      });
      if (!claimed || claimed.status !== "cancelled") return null;
    }

    const result = await products.advanceAuctionWinner(order.auctionId, {
      currentBidId: claimed.auctionBidId,
      orderId: claimed.id,
      expiredBuyerId: claimed.buyerId,
    });

    if (result?.outcome === "reassigned") {
      const finalized = await orders.finalizeExpiredAuctionOrder({
        id: claimed.id,
        expectedVersion: claimed.version,
        successorOrder: {
          id: result.orderId,
          buyerId: result.buyerId,
          auctionBidId: result.bidId,
          price: result.price,
          paymentDeadlineAt: result.paymentDeadlineAt,
        },
      });
      return finalized;
    }

    if (result?.outcome === "released") {
      return orders.finalizeExpiredAuctionOrder({
        id: claimed.id,
        expectedVersion: claimed.version,
      });
    }

    throw new Error("product-service returned an invalid auction settlement outcome");
  }

  async function expireDue({ at = now(), take = 50 } = {}) {
    if (sweeping) return { processed: 0, skipped: true };
    sweeping = true;
    try {
      const due = await orders.findAuctionOrdersDueForSettlement(at, take);
      let processed = 0;
      const failures = [];
      for (const order of due) {
        try {
          const result = await settleOne(order, at);
          if (result) processed++;
        } catch (error) {
          failures.push({ orderId: order.id, error: error.message });
        }
      }
      return { processed, failures };
    } finally {
      sweeping = false;
    }
  }

  function startWorker({ intervalMs = 15_000 } = {}) {
    if (workerTimer) return workerTimer;
    const sweep = () =>
      expireDue().catch((error) => {
        console.warn("[order-service] auction settlement sweep failed:", error.message);
      });
    sweep();
    workerTimer = setInterval(sweep, intervalMs);
    workerTimer.unref?.();
    return workerTimer;
  }

  function stopWorker() {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
  }

  return { settleOne, expireDue, startWorker, stopWorker };
}

module.exports = createAuctionSettlementService();
module.exports.createAuctionSettlementService = createAuctionSettlementService;
module.exports.AUCTION_PAYMENT_TTL_MS = AUCTION_PAYMENT_TTL_MS;
