const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("./disputeService");
const model = require("./disputeModel");
const orderModel = require("../../models/orderModel");
const auth = require("../../services/authClient");
const chat = require("../../services/chatClient");

const cs = {
  disputeId: "d1",
  userId: "cs1",
  role: "CUSTOMER_SERVICE",
  version: 2,
  reason: "ปัญหา: wrong item\nขาดอำนาจ: refund\nข้อเสนอแนะ: ",
};
const owned = {
  id: "d1",
  orderId: "o1",
  assignedTo: "cs1",
  assignedRole: "CUSTOMER_SERVICE",
  status: "OPEN",
  version: 2,
};

test("self handoff fails before lookup; assigning the existing owner also fails", async (t) => {
  const lookup = t.mock.method(model, "findById", async () => owned);
  await assert.rejects(service.reassign({ ...cs, toUserId: " cs1 " }), {
    status: 400,
  });
  assert.equal(lookup.mock.callCount(), 0);
  await assert.rejects(
    service.reassign({
      ...cs,
      userId: "ts1",
      role: "TRUST_AND_SAFETY",
      toUserId: "cs1",
    }),
    { status: 400 },
  );
});

test("CS escalation accepts an empty recommendation and targets T&S; CS cannot re-escalate safety work", async (t) => {
  t.mock.method(model, "findById", async () => owned);
  t.mock.method(auth, "getUser", async (id) => ({
    id,
    status: "ACTIVE",
    roles: ["TRUST_AND_SAFETY"],
  }));
  const update = t.mock.method(model, "escalate", async (data) => data);
  await service.escalate({ ...cs, toUserId: "ts1" });
  assert.equal(update.mock.calls[0].arguments[0].toUserId, "ts1");
  assert.equal(update.mock.calls[0].arguments[0].reason, cs.reason.trim());
  model.findById = async () => ({ ...owned, assignedRole: "TRUST_AND_SAFETY" });
  await assert.rejects(service.escalate(cs), { status: 403 });
});

test("assigned T&S can decide and notify; CS and an unassigned officer cannot", async (t) => {
  const safety = {
    ...owned,
    assignedRole: "TRUST_AND_SAFETY",
    assignedTo: "ts1",
  };
  t.mock.method(model, "findById", async () => safety);
  t.mock.method(orderModel, "findById", async () => ({ id: "o1", version: 8 }));
  const update = t.mock.method(model, "decide", async (data) => ({
    ...safety,
    ...data,
    status: "DECIDED",
  }));
  const notice = t.mock.method(chat, "sendDisputeNotice", async () => {});
  t.mock.method(chat, "lockDisputeConversation", async () => {});
  const args = {
    ...cs,
    decision: "APPROVE_REFUND",
    idempotencyKey: "test-verdict",
  };
  await assert.rejects(service.decide(args), { status: 403 });
  await assert.rejects(
    service.decide({ ...args, userId: "other", role: "TRUST_AND_SAFETY" }),
    { status: 403 },
  );
  assert.equal(update.mock.callCount(), 0);
  assert.equal(
    (await service.decide({ ...args, userId: "ts1", role: "TRUST_AND_SAFETY" }))
      .status,
    "DECIDED",
  );
  assert.equal(update.mock.callCount(), 1);
  assert.equal(notice.mock.callCount(), 1);
});

test("soft-deleted disputes are hidden from customers and CS", async (t) => {
  t.mock.method(model, "findById", async () => ({
    ...owned,
    deletedAt: new Date(),
    status: "DECIDED",
  }));
  await assert.rejects(service.getById(cs), { status: 404 });
  await assert.rejects(service.getById({ ...cs, role: "BUYER" }), {
    status: 404,
  });
});
