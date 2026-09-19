const test = require("node:test");
const assert = require("node:assert/strict");

const orderTransitionService = require("./orderTransitionService");

test("addHold creates an active hold record via tx", async () => {
  let createdPayload = null;
  const mockTx = {
    orderHold: {
      create: async ({ data }) => {
        createdPayload = data;
        return { id: "hold-1", ...data };
      },
    },
  };

  const hold = await orderTransitionService.addHold(mockTx, {
    orderId: "order-123",
    source: "TRUST_AND_SAFETY",
    referenceId: "ref-abc",
    reason: "Suspicious activity detected",
    heldBy: "admin-user",
  });

  assert.equal(hold.id, "hold-1");
  assert.equal(createdPayload.orderId, "order-123");
  assert.equal(createdPayload.source, "TRUST_AND_SAFETY");
  assert.equal(createdPayload.referenceId, "ref-abc");
  assert.equal(createdPayload.reason, "Suspicious activity detected");
  assert.equal(createdPayload.heldBy, "admin-user");
  assert.ok(createdPayload.heldAt instanceof Date);
});

test("releaseHold marks active holds as released", async () => {
  let updateWhere = null;
  let updateData = null;
  const mockTx = {
    orderHold: {
      updateMany: async ({ where, data }) => {
        updateWhere = where;
        updateData = data;
        return { count: 1 };
      },
    },
  };

  const count = await orderTransitionService.releaseHold(mockTx, {
    orderId: "order-123",
    source: "DISPUTE",
    referenceId: "disp-1",
    reason: "Dispute rejected by agent",
    releasedBy: "agent-1",
  });

  assert.equal(count, 1);
  assert.deepEqual(updateWhere, {
    orderId: "order-123",
    source: "DISPUTE",
    releasedAt: null,
    referenceId: "disp-1",
  });
  assert.equal(updateData.releasedBy, "agent-1");
  assert.equal(updateData.releaseReason, "Dispute rejected by agent");
  assert.ok(updateData.releasedAt instanceof Date);
});

test("hasActiveHolds returns boolean based on count", async () => {
  const mockTxWithHolds = {
    orderHold: { count: async () => 2 },
  };
  const mockTxWithoutHolds = {
    orderHold: { count: async () => 0 },
  };

  assert.equal(await orderTransitionService.hasActiveHolds(mockTxWithHolds, "o1"), true);
  assert.equal(await orderTransitionService.hasActiveHolds(mockTxWithoutHolds, "o2"), false);
});

test("resolveHoldState preserves hold when other hold sources remain active", async () => {
  const mockTx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        status: "disputed",
        preDisputeStatus: "completed",
        paymentSimulationStatus: "NORMAL",
        dispute: { status: "DECIDED", decision: "REJECT" },
      }),
    },
    orderHold: {
      count: async () => 1, // T&S hold still active
    },
  };

  const state = await orderTransitionService.resolveHoldState(mockTx, "order-1");
  assert.equal(state.isPayoutHeld, true);
  assert.equal(state.nextStatus, "disputed");
  assert.equal(state.activeHoldCount, 1);
});

test("resolveHoldState restores preDisputeStatus when all holds released and dispute was REJECT", async () => {
  const mockTx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        status: "disputed",
        preDisputeStatus: "delivered",
        paymentSimulationStatus: "NORMAL",
        dispute: { status: "DECIDED", decision: "REJECT" },
      }),
    },
    orderHold: {
      count: async () => 0, // No active holds
    },
  };

  const state = await orderTransitionService.resolveHoldState(mockTx, "order-1");
  assert.equal(state.isPayoutHeld, false);
  assert.equal(state.nextStatus, "delivered");
  assert.equal(state.activeHoldCount, 0);
});

test("resolveHoldState locks status as refunded when APPROVE_REFUND occurred", async () => {
  const mockTx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        status: "refunded",
        preDisputeStatus: "completed",
        paymentSimulationStatus: "NORMAL",
        dispute: { status: "DECIDED", decision: "APPROVE_REFUND" },
      }),
    },
    orderHold: {
      count: async () => 0,
    },
  };

  const state = await orderTransitionService.resolveHoldState(mockTx, "order-1");
  assert.equal(state.isPayoutHeld, false);
  assert.equal(state.nextStatus, "refunded");
});

test("assertCanParticipantUpdateStatus rejects mutating disputed or held orders", () => {
  assert.throws(
    () => orderTransitionService.assertCanParticipantUpdateStatus({ status: "disputed" }),
    /cannot update status while order has an open dispute/,
  );

  assert.throws(
    () => orderTransitionService.assertCanParticipantUpdateStatus({ status: "completed", payoutHeld: true }),
    /cannot update status while order payout is on hold/,
  );

  assert.throws(
    () => orderTransitionService.assertCanParticipantUpdateStatus({ status: "completed", paymentSimulationStatus: "ON_HOLD" }),
    /cannot update status while order funds are on hold/,
  );

  assert.doesNotThrow(() => {
    orderTransitionService.assertCanParticipantUpdateStatus({
      status: "in_transit",
      payoutHeld: false,
      paymentSimulationStatus: "NORMAL",
    });
  });
});
