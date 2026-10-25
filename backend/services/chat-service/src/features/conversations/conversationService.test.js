const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("./conversationService");
const model = require("./conversationModel");
const products = require("../../services/productClient");
const orders = require("../../services/orderClient");

function fixture(t, { status = "sold", existing = null, createError } = {}) {
  t.mock.method(products, "getProduct", async () => ({
    id: "p",
    sellerId: "seller",
    status,
  }));
  t.mock.method(model, "findByContextKey", async () => existing);
  t.mock.method(model, "create", async () => {
    if (createError) throw createError;
    return { id: "new-room" };
  });
}

test("TC19: a sold product cannot create a new conversation", async (t) => {
  fixture(t);
  await assert.rejects(
    service.createOrOpenProductConversation({
      productId: "p",
      buyerId: "buyer",
    }),
    (err) => err.status === 400 && /ขายแล้ว/.test(err.message),
  );
  assert.equal(model.create.mock.callCount(), 0);
});

test("TC19: the buyer can reopen their existing conversation after the product is sold", async (t) => {
  fixture(t, { existing: { id: "old-room" } });
  const room = await service.createOrOpenProductConversation({
    productId: "p",
    buyerId: "buyer",
  });
  assert.equal(room.id, "old-room");
  assert.equal(model.create.mock.callCount(), 0);
  assert.equal(
    model.findByContextKey.mock.calls[0].arguments[0],
    "PRODUCT:p:buyer",
  );
});

test("a verified buyer can start a new conversation after purchase", async (t) => {
  fixture(t);
  t.mock.method(orders, "getOrder", async () => ({
    buyerId: "buyer", productId: "p", sellerId: "seller",
  }));
  const room = await service.createOrOpenProductConversation({
    productId: "p", buyerId: "buyer", orderId: "order-1",
  });
  assert.equal(room.id, "new-room");
  assert.equal(orders.getOrder.mock.calls[0].arguments[0], "order-1");
  const created = model.create.mock.calls[0].arguments[0];
  assert.equal(created.contextKey, "PRODUCT:p:buyer");
  assert.deepEqual(created.participants.map((p) => p.userId), ["buyer", "seller"]);
});

for (const [reason, order] of [
  ["another buyer", { buyerId: "stranger", productId: "p", sellerId: "seller" }],
  ["another product", { buyerId: "buyer", productId: "other", sellerId: "seller" }],
  ["another seller", { buyerId: "buyer", productId: "p", sellerId: "other" }],
  ["a missing order", null],
]) {
  test(`post-purchase chat rejects ${reason}`, async (t) => {
    fixture(t);
    t.mock.method(orders, "getOrder", async () => order);
    await assert.rejects(service.createOrOpenProductConversation({
      productId: "p", buyerId: "buyer", orderId: "order-1",
    }), (err) => err.status === 403);
    assert.equal(model.create.mock.callCount(), 0);
  });
}

test("available product still allows a new conversation", async (t) => {
  fixture(t, { status: "available" });
  assert.equal(
    (
      await service.createOrOpenProductConversation({
        productId: "p",
        buyerId: "buyer",
      })
    ).id,
    "new-room",
  );
});

test("a concurrent duplicate conversation still reopens the winning room", async (t) => {
  fixture(t, { status: "available", createError: { code: "P2002" } });
  let calls = 0;
  t.mock.method(model, "findByContextKey", async () =>
    ++calls === 1 ? null : { id: "winner" },
  );
  assert.equal(
    (
      await service.createOrOpenProductConversation({
        productId: "p",
        buyerId: "buyer",
      })
    ).id,
    "winner",
  );
});
