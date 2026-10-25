const test = require("node:test");
const assert = require("node:assert/strict");
const orderModel = require("../models/orderModel");
const controller = require("./orderController");

const hidden = {
  id: "order-1", buyerId: "buyer-1", sellerId: "seller-1",
  dispute: { id: "dispute-1", sellerVisible: false, reason: "ข้อมูลส่วนตัวของผู้ซื้อ", evidence: [{ id: "evidence-1" }] },
  holdReason: "ข้อมูลส่วนตัวของผู้ซื้อ", holds: [{ holdReason: "ข้อมูลส่วนตัวของผู้ซื้อ" }],
  payments: [{ id: "payment-1", holds: [{ holdReason: "ข้อมูลส่วนตัวของผู้ซื้อ" }] }],
};

test("seller order list and detail omit unannounced dispute data", async (t) => {
  t.mock.method(orderModel, "listBySeller", async () => ({ items: [hidden], total: 1 }));
  t.mock.method(orderModel, "findById", async () => hidden);
  let list;
  await controller.selling(
    { userId: "seller-1", query: {} },
    { json: (value) => { list = value; } },
    (error) => { throw error; },
  );
  assert.equal(list.items[0].dispute, null);
  assert.equal(list.items[0].holdReason, null);
  assert.deepEqual(list.items[0].holds, []);
  assert.equal(list.items[0].payments[0].holds, undefined);

  let detail;
  await controller.getOne(
    { userId: "seller-1", params: { id: "order-1" } },
    { json: (value) => { detail = value; } },
    (error) => { throw error; },
  );
  assert.equal(detail.dispute, null);

  await controller.getOne(
    { userId: "buyer-1", params: { id: "order-1" } },
    { json: (value) => { detail = value; } },
    (error) => { throw error; },
  );
  assert.equal(detail.dispute.reason, "ข้อมูลส่วนตัวของผู้ซื้อ");
});
