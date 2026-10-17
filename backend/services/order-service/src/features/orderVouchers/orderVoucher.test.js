const test = require("node:test");
const assert = require("node:assert/strict");
const { createOrderVoucherService } = require("./orderVoucherService");
function fixture(overrides = {}, failWrite = false) {
  let state = {
    id: "o1",
    buyerId: "buyer",
    productId: "p1",
    sellerId: "seller",
    status: "pending_payment",
    checkoutId: null,
    originalAmount: "1000",
    ordersAmount: "900",
    campaignId: "old",
    campaignCode: "OLD100",
    version: 1,
    basketId: "b1",
    basket: { unlockAt: new Date(Date.now() + 600000) },
    ...overrides,
  };
  const calls = [];
  const tx = {
    $queryRaw: async () => [],
    order: {
      findUnique: async () => state,
      update: async ({ data }) => {
        if (failWrite) throw new Error("write failed");
        state = { ...state, ...data, version: state.version + 1 };
        return state;
      },
    },
    orderLog: { create: async () => ({}) },
  };
  const db = {
    $transaction: async (fn) => {
      const before = { ...state };
      try {
        return await fn(tx);
      } catch (error) {
        state = before;
        throw error;
      }
    },
  };
  const products = {
    quoteAndHold: async (campaignId, input) => {
      calls.push(["quote", campaignId, input]);
      return {
        campaignId,
        campaignCode: "NEW200",
        discountAmount: 200,
        finalPrice: 800,
      };
    },
    releaseVoucher: async (campaignId) => calls.push(["release", campaignId]),
    holdVoucher: async (campaignId) => calls.push(["hold", campaignId]),
  };
  return {
    service: createOrderVoucherService(db, products),
    calls,
    products,
    state: () => state,
  };
}
test("replaces only one order's voucher with verified prices and releases the old hold", async () => {
  const { service, calls } = fixture();
  const order = await service.update({
    orderId: "o1",
    buyerId: "buyer",
    campaignId: "new",
    finalPrice: 0,
  });
  assert.equal(order.campaignId, "new");
  assert.equal(order.finalPrice, 800);
  assert.equal(order.discountAmount, 200);
  assert.deepEqual(
    calls.map((call) => call.slice(0, 2)),
    [
      ["quote", "new"],
      ["release", "old"],
    ],
  );
});
test("clearing restores original price; repeated selections are idempotent", async () => {
  const { service, calls } = fixture();
  assert.equal(
    (
      await service.update({
        orderId: "o1",
        buyerId: "buyer",
        campaignId: "old",
      })
    ).finalPrice,
    900,
  );
  assert.equal(calls.length, 0);
  const removed = await service.update({
    orderId: "o1",
    buyerId: "buyer",
    campaignId: null,
  });
  assert.equal(removed.finalPrice, 1000);
  assert.equal(removed.campaignCode, null);
  assert.equal(removed.campaignId, null);
});
for (const overrides of [
  { buyerId: "other" },
  { checkoutId: "checkout" },
  { status: "confirmed" },
  { basket: { unlockAt: new Date(0) } },
  { basketId: null },
]) {
  test(`denies unauthorized or frozen order edits: ${JSON.stringify(overrides)}`, async () => {
    const { service, calls } = fixture(overrides);
    await assert.rejects(
      service.update({ orderId: "o1", buyerId: "buyer", campaignId: "new" }),
    );
    assert.equal(calls.length, 0);
  });
}
test("invalid quote leaves the original order intact and releases the attempted hold", async () => {
  const { service, products, state, calls } = fixture();
  products.quoteAndHold = async () => ({
    campaignId: "new",
    discountAmount: 200,
    finalPrice: 0,
  });
  await assert.rejects(
    service.update({ orderId: "o1", buyerId: "buyer", campaignId: "new" }),
    /inconsistent prices/,
  );
  assert.equal(state().campaignId, "old");
  assert.deepEqual(calls, [["release", "new"]]);
});
test("failed local write releases new voucher and restores original hold", async () => {
  const { service, calls, state } = fixture({}, true);
  await assert.rejects(
    service.update({ orderId: "o1", buyerId: "buyer", campaignId: "new" }),
    /write failed/,
  );
  assert.equal(state().campaignId, "old");
  assert.deepEqual(
    calls.map((call) => call.slice(0, 2)),
    [
      ["quote", "new"],
      ["release", "old"],
      ["release", "new"],
      ["hold", "old"],
    ],
  );
});
