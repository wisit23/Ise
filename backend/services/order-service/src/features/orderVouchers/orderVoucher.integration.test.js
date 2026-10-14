const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const db = require("../../models/prismaClient");
const { createOrderVoucherService } = require("./orderVoucherService");
test("PostgreSQL persists per-item prices and voucher code through Order history projection", async (t) => {
  if (!process.env.DATABASE_URL_ORDER) {
    t.skip("Set DATABASE_URL_ORDER");
    return;
  }
  const rollback = new Error("rollback voucher fixture");
  try {
    await db.$transaction(
      async (tx) => {
        const buyerId = randomUUID();
        const order = await tx.order.create({
          data: {
            id: randomUUID(),
            buyerId,
            sellerId: randomUUID(),
            productId: randomUUID(),
            orderType: "BUY_NOW",
            originalAmount: 10,
            ordersAmount: 10,
            status: "pending_payment",
            basket: {
              create: {
                id: randomUUID(),
                buyerId,
                productId: randomUUID(),
                status: "locked",
                lockAt: new Date(),
                unlockAt: new Date(Date.now() + 600000),
              },
            },
          },
        });
        const service = createOrderVoucherService(
          { $transaction: (fn) => fn(tx) },
          {
            quoteAndHold: async (campaignId) => ({
              campaignId,
              campaignCode: "SAVE2",
              discountAmount: 2,
              finalPrice: 8,
            }),
            releaseVoucher: async () => {},
            holdVoucher: async () => {},
          },
        );
        const saved = await service.update({
          orderId: order.id,
          buyerId,
          campaignId: "fixture-campaign",
        });
        assert.equal(saved.finalPrice, 8);
        assert.equal(saved.campaignCode, "SAVE2");
        const loaded = await tx.order.findUnique({ where: { id: order.id } });
        assert.equal(loaded.campaignCode, "SAVE2");
        const cleared = await service.update({
          orderId: order.id,
          buyerId,
          campaignId: null,
        });
        assert.equal(cleared.finalPrice, 10);
        assert.equal(cleared.campaignCode, null);
        throw rollback;
      },
      { timeout: 20000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.$disconnect();
  }
});
