const test = require("node:test");
const assert = require("node:assert/strict");
const { notifyDisputeOpened, notifyOrderStatusChanged } = require("./chatClient");

test("opening a buyer dispute only notifies the buyer before seller contact", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({}) };
  });
  await notifyDisputeOpened({ id: "d1", reason: "damaged" }, {
    id: "o1", buyerId: "buyer", sellerId: "seller", productTitle: "Shirt",
  });
  assert.deepEqual(calls.map((call) => call.userId), ["buyer"]);
});

for (const status of ["paid", "confirmed", "ready_to_ship"]) {
  test(`rejecting ${status} notifies the buyer of the full refund and seller reason`, async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({}) };
    });
    await notifyOrderStatusChanged({
      id: "o1", buyerId: "buyer", sellerId: "seller", productId: "p1",
      status, originalAmount: "150", ordersAmount: "100", productTitle: "Shirt",
    }, "cancelled", { actorId: "seller", reason: "สินค้าชำรุดก่อนจัดส่ง" });
    const notice = calls.find((call) => call.userId === "buyer");
    assert.match(notice.title, /คืนเงินเต็มจำนวน/);
    assert.match(notice.message, /฿100/);
    assert.match(notice.message, /สินค้าชำรุดก่อนจัดส่ง/);
    assert.equal(notice.metadata.status, "cancelled");
    assert.ok(calls.some((call) => call.event === "order:updated"));
  });
}
