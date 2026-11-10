const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const model = require("./disputeModel");
const transitions = require("../../services/orderTransitionService");

for (const reached of [false, true]) {
  test(`opening dispute before reconciliation respects arrival deadline (${reached})`, async (t) => {
    const order = { id: "o", status: "in_transit", version: 1,
      deliveredAt: new Date(Date.now() + (reached ? -1000 : 60_000)),
      originalAmount: "100", ordersAmount: "100" };
    const claims = [];
    t.mock.method(transitions, "addHold", async () => {});
    t.mock.method(prisma, "$transaction", async (callback) => callback({
      order: {
        findUnique: async () => order,
        updateMany: async (args) => { claims.push(args); return { count: args.where.status.in.includes(order.status) ? 1 : 0 }; },
      },
      disputeCase: { create: async ({ data }) => ({ id: "d", ...data }) },
      disputeCaseLog: { create: async () => {} },
    }));
    const call = () => model.openDispute({ orderId: "o", openedBy: "buyer", reason: "wrong item", disputeType: "OTHER", expectedVersion: 1 });
    if (!reached) await assert.rejects(call(), { status: 409 });
    else {
      await call();
      assert.equal(claims[0].data.preDisputeStatus, "delivered");
    }
  });
}
