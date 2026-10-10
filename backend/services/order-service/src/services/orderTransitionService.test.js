const test = require("node:test");
const assert = require("node:assert/strict");
const transitions = require("./orderTransitionService");
const { money } = require("../models/money");
function fixture(decision = "REJECT") {
  const payment = { id: "pay-1", paymentAmount: money("1000.50") };
  const holds = [];
  const order = {
    id: "o1",
    status: "disputed",
    preDisputeStatus: "completed",
    dispute: { decision },
  };
  const matches = (h, w) =>
    (!w.id || h.id === w.id) &&
    (!w.source || h.source === w.source) &&
    (!w.referenceId || h.referenceId === w.referenceId) &&
    (!w.paymentId || h.paymentId === w.paymentId) &&
    (w.releaseAt !== null || !h.releaseAt);
  const db = {
    payment: { findFirst: async () => payment },
    order: { findUnique: async () => order },
    hold: {
      findFirst: async ({ where }) => holds.find((h) => matches(h, where)),
      findMany: async ({ where }) => holds.filter((h) => matches(h, where)),
      create: async ({ data }) => {
        const h = { id: "h" + holds.length, releaseAt: null, ...data };
        holds.push(h);
        return h;
      },
      updateMany: async ({ where, data }) => {
        const list = holds.filter((h) => matches(h, where));
        list.forEach((h) => Object.assign(h, data));
        return { count: list.length };
      },
      count: async () => holds.filter((h) => !h.releaseAt).length,
    },
  };
  return { db, holds, payment, order };
}
test("one payment has overlapping hold reasons; releasing dispute leaves T&S active", async () => {
  const { db, holds, payment } = fixture();
  for (const [source, referenceId] of [
    ["DISPUTE", "case1"],
    ["TRUST_AND_SAFETY", "o1"],
  ]) {
    await transitions.addHold(db, {
      orderId: "o1",
      source,
      referenceId,
      reason: "Investigate",
      holdBy: "agent",
    });
  }
  assert.equal(holds.length, 2);
  assert.ok(
    holds.every(
      (h) => h.paymentId === payment.id && h.holdAmount.equals("1000.50"),
    ),
  );
  assert.equal(payment.paymentAmount.toString(), "1000.5");
  assert.equal(holds[0].holdBy, "agent");
  assert.ok(holds[0].holdAt instanceof Date);
  await transitions.releaseHold(db, {
    orderId: "o1",
    source: "DISPUTE",
    referenceId: "case1",
    releasedBy: "cs1",
  });
  assert.equal(holds[0].releasedBy, "cs1");
  assert.ok(holds[0].releaseAmount.equals(holds[0].holdAmount));
  assert.equal(holds[1].releaseAt, null);
  assert.deepEqual(await transitions.resolveHoldState(db, "o1"), {
    isPayoutHeld: true,
    nextStatus: "disputed",
    activeHoldCount: 1,
  });
  await transitions.releaseHold(db, {
    orderId: "o1",
    source: "TRUST_AND_SAFETY",
    referenceId: "o1",
    releasedBy: "ts1",
  });
  assert.equal(await transitions.hasActiveHolds(db, "o1"), false);
  assert.equal(
    (await transitions.resolveHoldState(db, "o1")).nextStatus,
    "completed",
  );
});
test("refund waits for the final active reason", async () => {
  const { db } = fixture("APPROVE_REFUND");
  await transitions.addHold(db, {
    orderId: "o1",
    source: "TRUST_AND_SAFETY",
    referenceId: "o1",
    reason: "Investigate",
    holdBy: "ts",
  });
  assert.equal(
    (await transitions.resolveHoldState(db, "o1")).nextStatus,
    "disputed",
  );
  await transitions.releaseHold(db, {
    orderId: "o1",
    source: "TRUST_AND_SAFETY",
    referenceId: "o1",
    releasedBy: "ts",
  });
  assert.equal(
    (await transitions.resolveHoldState(db, "o1")).nextStatus,
    "refunded",
  );
});
test("same reason is idempotent and another reference is not released", async () => {
  const { db, holds } = fixture();
  const input = {
    orderId: "o1",
    source: "DISPUTE",
    referenceId: "case1",
    reason: "Review",
    holdBy: "buyer",
  };
  await transitions.addHold(db, input);
  await transitions.addHold(db, input);
  assert.equal(holds.length, 1);
  assert.equal(
    await transitions.releaseHold(db, {
      ...input,
      referenceId: "case2",
      releasedBy: "cs",
    }),
    0,
  );
});
test("unpaid orders cannot create holds", async () => {
  const { db } = fixture();
  db.payment.findFirst = async () => null;
  await assert.rejects(
    transitions.addHold(db, {
      orderId: "o1",
      source: "DISPUTE",
      referenceId: "c1",
    }),
    /successful payment/,
  );
});
test("open case stays frozen even if its hold is missing", async () => {
  const { db } = fixture(null);
  assert.equal(
    (await transitions.resolveHoldState(db, "o1")).isPayoutHeld,
    true,
  );
});
test("participants cannot mutate disputed or held orders", () => {
  for (const order of [
    { status: "disputed" },
    { status: "completed", payoutHeld: true },
    { status: "completed", paymentSimulationStatus: "ON_HOLD" },
  ]) {
    assert.throws(
      () => transitions.assertCanParticipantUpdateStatus(order),
      (err) => err.status === 409,
    );
  }
  assert.doesNotThrow(() =>
    transitions.assertCanParticipantUpdateStatus({ status: "confirmed" }),
  );
});
