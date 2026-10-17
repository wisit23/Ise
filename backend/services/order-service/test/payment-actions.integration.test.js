const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const db = require("../src/models/prismaClient");
const { createCheckoutSessionService } = require("../src/features/checkoutSessions/checkoutSessionService");

test("PostgreSQL checkout address update and cancellation persist snapshots, logs and reservation release", async (t) => {
  if (!process.env.DATABASE_URL_ORDER) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw new Error("DATABASE_URL_ORDER required");
    t.skip("Set DATABASE_URL_ORDER");
    return;
  }
  const buyerId = `payment-actions-${randomUUID()}`;
  const now = new Date();
  const address = {
    recipientName: "Test Buyer", phone: "0812345678", addressLine: "99 Road",
    subdistrict: "Area", district: "District", province: "Bangkok", postalCode: "10110",
  };
  const calls = [];
  const products = {
    extendProductReservation: async () => {},
    releaseProductReservation: async (...args) => calls.push(args),
    releaseVoucher: async () => {},
  };
  const service = createCheckoutSessionService(db, products, undefined, async ({ addressId }) => ({ ...address, addressLine: addressId }));
  let basket;
  let order;
  let checkout;
  t.after(async () => {
    if (order) {
      await db.productSyncJob.deleteMany({ where: { orderId: order.id } });
      await db.orderLog.deleteMany({ where: { orderId: order.id } });
      await db.shipping.deleteMany({ where: { orderId: order.id } });
      await db.order.delete({ where: { id: order.id } });
    }
    if (checkout) await db.checkout.delete({ where: { id: checkout.id } });
    if (basket) await db.basket.delete({ where: { id: basket.id } });
    await db.$disconnect();
  });
  basket = await db.basket.create({ data: {
    buyerId, productId: randomUUID(), status: "active", lockAt: now,
    unlockAt: new Date(now.getTime() + 300000),
  } });
  order = await db.order.create({ data: {
    buyerId, sellerId: randomUUID(), productId: basket.productId, basketId: basket.id,
    orderType: "NORMAL", originalAmount: "650", ordersAmount: "650", status: "pending_payment",
  } });
  checkout = await service.create({ buyerId, orderIds: [order.id], addressId: "a1", now });
  const changed = await service.updateAddress({ buyerId, sessionId: checkout.id, addressId: "a2" });
  assert.equal(changed.shippingAddress.addressLine, "a2");
  assert.equal(new Date(changed.expiresAt).getTime(), new Date(checkout.expiresAt).getTime());
  const shipping = await db.shipping.findUnique({ where: { orderId: order.id } });
  assert.equal(shipping.addressSnapshot.addressLine, "a2");
  await assert.rejects(service.cancel({ buyerId: "other", sessionId: checkout.id }), (err) => err.status === 403);
  const cancelled = await service.cancel({ buyerId, sessionId: checkout.id });
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).status, "cancelled");
  assert.equal((await db.basket.findUnique({ where: { id: basket.id } })).status, "cancelled");
  assert.equal(await db.payment.count({ where: { orderId: order.id } }), 0);
  assert.equal(await db.orderLog.count({ where: { orderId: order.id, action: "CHECKOUT_CANCELLED" } }), 1);
  assert.equal(calls.length, 1);
  await service.cancel({ buyerId, sessionId: checkout.id });
  assert.equal(calls.length, 1);
  await assert.rejects(service.confirm({ buyerId, sessionId: checkout.id }), /no longer payable/);
});
