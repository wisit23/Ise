const test = require("node:test");
const assert = require("node:assert/strict");
const { notifyDisputeStatus } = require("./disputeStatusNotices");

const ORDER = { id: "ORD-1", buyerId: "buyer-1", sellerId: "seller-1", productTitle: "เสื้อยืด" };
const orders = { findById: async () => ORDER };

function fakeChat() {
  const sent = [];
  return { sent, sendSystemNotification: async (data) => sent.push(data) };
}

test("claim notifies the buyer only while the seller is not yet involved", async () => {
  const chat = fakeChat();
  await notifyDisputeStatus({ id: "d-1", orderId: "ORD-1", version: 2, status: "OPEN", caseLog: [] }, "CLAIMED", { orders, chat });
  assert.deepEqual(chat.sent.map((n) => n.userId), ["buyer-1"]);
  const [notice] = chat.sent;
  assert.equal(notice.type, "DISPUTE");
  assert.equal(notice.link, "/support/cases/ORD-1");
  assert.equal(notice.metadata.statusUpdate, true);
  assert.equal(notice.metadata.event, "CLAIMED");
  assert.equal(notice.entityId, "dispute:d-1:CLAIMED:2:buyer");
});

test("escalation reaches the seller too once staff have contacted them", async () => {
  const chat = fakeChat();
  const dispute = { id: "d-1", orderId: "ORD-1", version: 4, status: "OPEN", caseLog: [{ action: "SELLER_CONTACTED" }] };
  await notifyDisputeStatus(dispute, "ESCALATED", { orders, chat });
  assert.deepEqual(chat.sent.map((n) => n.metadata.role).sort(), ["buyer", "seller"]);
  for (const notice of chat.sent) {
    assert.match(notice.title, /ตรวจสอบเพิ่มเติม/);
    assert.doesNotMatch(`${notice.title} ${notice.message}`, /Trust|T&S|Admin/i);
  }
});

test("chat-service failures never reach the staff action", async (t) => {
  t.mock.method(console, "error", () => {});
  const chat = { sendSystemNotification: async () => { throw new Error("chat down"); } };
  const result = await notifyDisputeStatus({ id: "d-1", orderId: "ORD-1", version: 1 }, "CLAIMED", { orders, chat });
  assert.deepEqual(result, [null]);
  const broken = { findById: async () => { throw new Error("db down"); } };
  assert.deepEqual(await notifyDisputeStatus({ id: "d-1", orderId: "ORD-1" }, "CLAIMED", { orders: broken, chat }), []);
});

test("unknown events and missing orders send nothing", async () => {
  const chat = fakeChat();
  await notifyDisputeStatus({ id: "d-1", orderId: "ORD-1" }, "DECIDED", { orders, chat });
  await notifyDisputeStatus({ id: "d-1", orderId: "ORD-1" }, "CLAIMED", { orders: { findById: async () => null }, chat });
  assert.equal(chat.sent.length, 0);
});
