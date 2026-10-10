const test = require("node:test");
const assert = require("node:assert/strict");
const { buildContextKey } = require("./contextKey");

test("PRODUCT context key is deterministic for the same productId+buyerId", () => {
  const a = buildContextKey("PRODUCT", { productId: "p1", buyerId: "b1" });
  const b = buildContextKey("PRODUCT", { productId: "p1", buyerId: "b1" });
  assert.equal(a, b);
  assert.equal(a, "PRODUCT:p1:b1");
});

test("PRODUCT context key differs for a different buyer on the same product", () => {
  const a = buildContextKey("PRODUCT", { productId: "p1", buyerId: "b1" });
  const b = buildContextKey("PRODUCT", { productId: "p1", buyerId: "b2" });
  assert.notEqual(a, b);
});

test("PRODUCT context key requires both productId and buyerId", () => {
  assert.throws(() => buildContextKey("PRODUCT", { productId: "p1" }));
  assert.throws(() => buildContextKey("PRODUCT", { buyerId: "b1" }));
});

test("ORDER context key is deterministic for the same orderId", () => {
  const a = buildContextKey("ORDER", { orderId: "o1" });
  const b = buildContextKey("ORDER", { orderId: "o1" });
  assert.equal(a, b);
  assert.equal(a, "ORDER:o1");
});

test("SUPPORT context key is deterministic for the same ticketId", () => {
  assert.equal(buildContextKey("SUPPORT", { ticketId: "t1" }), "SUPPORT:t1");
});

test("DIRECT context key is order-independent (A,B) === (B,A)", () => {
  const ab = buildContextKey("DIRECT", { userIdA: "u1", userIdB: "u2" });
  const ba = buildContextKey("DIRECT", { userIdA: "u2", userIdB: "u1" });
  assert.equal(ab, ba);
});

test("unknown contextType throws", () => {
  assert.throws(() => buildContextKey("BOGUS", {}));
});
