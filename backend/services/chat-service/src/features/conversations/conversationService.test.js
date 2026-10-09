const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("./conversationService");
const model = require("./conversationModel");
const products = require("../../services/productClient");

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
