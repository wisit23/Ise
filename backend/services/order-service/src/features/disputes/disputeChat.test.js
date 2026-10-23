const test = require("node:test");
const assert = require("node:assert/strict");
const disputeModel = require("./disputeModel");
const disputeService = require("./disputeService");
const orderModel = require("../../models/orderModel");
const chatClient = require("../../services/chatClient");

test("order summaries expose seller visibility without internal workflow logs", () => {
  const summary = orderModel.disputeView({ id: "d1", status: "OPEN", caseLog: [{ action: "SELLER_CONTACTED" }] });
  assert.equal(summary.sellerVisible, true);
  assert.equal(summary.caseLog, undefined);
  assert.equal(orderModel.disputeView({ id: "d2", status: "OPEN" }).sellerVisible, false);
});

test("seller access starts only when the assigned agent contacts the seller", async (t) => {
  let contacted = false;
  t.mock.method(disputeModel, "findById", async () => ({
    id: "d1", orderId: "o1", status: "OPEN", assignedTo: "agent-1",
    assignedRole: "CUSTOMER_SERVICE",
    auditLog: contacted ? [{ action: "SELLER_CONTACTED" }] : [],
  }));
  t.mock.method(orderModel, "findById", async () => ({ id: "o1", buyerId: "buyer-1", sellerId: "seller-1" }));
  t.mock.method(chatClient, "joinDisputeConversation", async () => "seller-room");
  const log = t.mock.method(disputeModel, "auditLog", async () => { contacted = true; });
  const notify = t.mock.method(chatClient, "sendSystemNotification", async () => {});
  const seller = { disputeId: "d1", userId: "seller-1", role: "SELLER", side: "seller" };
  await assert.rejects(disputeService.joinConversation(seller), { status: 403 });
  await disputeService.joinConversation({ disputeId: "d1", userId: "agent-1", role: "CUSTOMER_SERVICE", side: "seller" });
  assert.equal(log.mock.calls[0].arguments[0].action, "SELLER_CONTACTED");
  assert.equal(notify.mock.calls[0].arguments[0].link, "/support/cases/o1");
  assert.equal((await disputeService.joinConversation(seller)).conversationId, "seller-room");
  assert.equal(log.mock.callCount(), 1);
});

test("dispute chat reuses the case room and authorizes the assigned agent", async (t) => {
  const originals = [
    disputeModel.findById,
    orderModel.findById,
    chatClient.joinDisputeConversation,
  ];
  t.after(() => {
    [
      disputeModel.findById,
      orderModel.findById,
      chatClient.joinDisputeConversation,
    ] = originals;
  });
  disputeModel.findById = async () => ({
    id: "dispute-1",
    orderId: "order-1",
    assignedTo: "agent-1",
    assignedRole: "CUSTOMER_SERVICE",
    status: "OPEN",
  });
  orderModel.findById = async () => ({
    id: "order-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
  });
  let joins = 0;
  chatClient.joinDisputeConversation = async (_dispute, _order, actor, side) => {
    joins += 1;
    assert.equal(actor.role, "AGENT");
    assert.equal(side, "buyer");
    return "room-1";
  };

  await assert.rejects(
    () =>
      disputeService.joinConversation({
        disputeId: "dispute-1",
        userId: "stranger",
        role: "BUYER",
      }),
    (err) => err.status === 403,
  );
  await assert.rejects(
    () =>
      disputeService.joinConversation({
        disputeId: "dispute-1",
        userId: "agent-2",
        role: "CUSTOMER_SERVICE",
      }),
    (err) => err.status === 403,
  );
  const first = await disputeService.joinConversation({
    disputeId: "dispute-1",
    userId: "agent-1",
    role: "CUSTOMER_SERVICE",
  });
  const second = await disputeService.joinConversation({
    disputeId: "dispute-1",
    userId: "agent-1",
    role: "CUSTOMER_SERVICE",
  });
  assert.deepEqual(first, { conversationId: "room-1", side: "buyer", readOnly: false });
  assert.deepEqual(second, first);
  assert.equal(joins, 2);
});
