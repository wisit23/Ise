const test = require("node:test");
const assert = require("node:assert/strict");
const { createCartService } = require("./cartService");

test("cart list selects only pending_payment orders, keeping basket states separate", async () => {
  const basketQueries = [];
  const orderQueries = [];
  const linked = { id: "order-linked", status: "pending_payment" };
  const legacy = { id: "order-without-basket", status: "pending_payment" };
  const db = {
    basket: { findMany: async (query) => {
      basketQueries.push(query);
      return [{ id: "basket", order: linked }];
    } },
    order: { findMany: async (query) => {
      orderQueries.push(query);
      return [legacy];
    } },
  };
  const service = createCartService({ db, orderModel: { INCLUDE: {}, view: (row) => row } });
  const result = await service.list({ buyerId: "buyer" });
  assert.equal(basketQueries[0].where.OR[1].order.status, "pending_payment");
  assert.equal(orderQueries[0].where.status, "pending_payment");
  assert.equal(basketQueries[0].where.status, "locked");
  assert.equal(orderQueries[0].where.buyerId, "buyer");
  assert.equal(result.total, 2);
  assert.equal(result.items[0].orderId, linked.id);
  assert.equal(result.items[1].orderId, legacy.id);
});

for (const status of ["payment_expired", "seller_confirmation_expired", "cancelled"]) {
  test(`cart cannot prepare a terminal ${status} order even with a locked basket`, async () => {
    const tx = { basket: {
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => ({ id: "basket", order: { status } }),
    } };
    const service = createCartService({
      db: { $transaction: async (callback) => callback(tx) },
      orderModel: { INCLUDE: {}, view: (row) => row },
    });
    await assert.rejects(service.prepare({ buyerId: "buyer", basketIds: ["basket"] }),
      (error) => error.status === 409);
  });
}
