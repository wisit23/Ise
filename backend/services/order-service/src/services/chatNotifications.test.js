const test = require("node:test");
const assert = require("node:assert/strict");
const chat = require("./chatClient");
const order = {
  id: "o-1", buyerId: "buyer", sellerId: "seller", productId: "p-1",
  productTitle: "เสื้อวินเทจ", ordersAmount: "100", status: "paid",
};
function capture(t) {
  const requests = [];
  t.mock.method(global, "fetch", async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ id: "notification" }) };
  });
  return requests;
}
const notifications = (requests) => requests.filter((r) => r.url.endsWith("/internal/notifications")).map((r) => r.body);

test("winner receives an actionable auction notification, normal cart addition does not", async (t) => {
  const requests = capture(t);
  await chat.notifyOrderPlaced(order);
  assert.equal(notifications(requests).length, 0);
  await chat.notifyOrderPlaced({ ...order, auctionId: "auction-1", paymentDeadlineAt: "2026-10-22T00:00:00Z" });
  const [notice] = notifications(requests);
  assert.equal(notice.userId, "buyer");
  assert.equal(notice.type, "AUCTION");
  assert.match(notice.title, /ชนะ/);
  assert.equal(notice.link, "/orders");
  assert.equal(notice.metadata.auctionId, "auction-1");
  assert.equal(notice.metadata.paymentDeadlineAt, "2026-10-22T00:00:00Z");
});

test("buyer cancellation notifies both parties of refund without blaming the seller", async (t) => {
  const requests = capture(t);
  await chat.notifyOrderStatusChanged(order, "cancelled", { actorId: "buyer" });
  const notices = notifications(requests);
  assert.deepEqual(notices.map((n) => n.userId).sort(), ["buyer", "seller"]);
  for (const notice of notices) {
    assert.match(notice.message, /ยกเลิกโดยผู้ซื้อ/);
    assert.doesNotMatch(notice.message, /ผู้ขาย.*ปฏิเสธ/);
    assert.equal(notice.metadata.refundAmount, "100");
  }
});

for (const status of ["ready_to_ship", "pickup_in_progress", "in_transit", "delivered", "completed", "payment_expired", "seller_confirmation_expired"]) {
  test(`both participants receive the ${status} notification`, async (t) => {
    const requests = capture(t);
    await chat.notifyOrderStatusChanged(order, status);
    const notices = notifications(requests);
    assert.deepEqual(notices.map((n) => n.userId).sort(), ["buyer", "seller"]);
    assert.ok(notices.every((n) => n.metadata.status === status));
    if (status === "seller_confirmation_expired") {
      assert.ok(notices.every((n) => /หมดเวลายืนยัน/.test(n.message) && /คืนเงิน/.test(n.message)));
      assert.ok(notices.every((n) => !/ปฏิเสธ/.test(n.message)));
    }
  });
}

test("seller rejection keeps its original reason and refund notification", async (t) => {
  const requests = capture(t);
  await chat.notifyOrderStatusChanged(order, "cancelled", { actorId: "seller", reason: "สินค้าเสียหาย" });
  const notice = notifications(requests).find((n) => n.userId === "buyer");
  assert.match(notice.message, /ผู้ขายได้ปฏิเสธ/);
  assert.match(notice.message, /สินค้าเสียหาย/);
});
