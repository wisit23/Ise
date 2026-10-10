const test = require("node:test");
const assert = require("node:assert/strict");
const disputeModel = require("./disputeModel");
const disputeService = require("./disputeService");
const orderModel = require("../../models/orderModel");
const chatClient = require("../../services/chatClient");

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
