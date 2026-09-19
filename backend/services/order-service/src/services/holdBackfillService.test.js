const test = require("node:test");
const assert = require("node:assert/strict");

const { backfillAndValidateHolds } = require("./holdBackfillService");

test("holdBackfillService backfills holds and identifies ambiguous states", async () => {
  const mockOrders = [
    // 1. Legitimate open dispute missing OrderHold record
    {
      id: "ord-1",
      version: 1,
      status: "disputed",
      payoutHeld: true,
      paymentSimulationStatus: "NORMAL",
      dispute: {
        id: "disp-1",
        status: "OPEN",
        reason: "Defective item",
        openedBy: "buyer-1",
        createdAt: new Date("2026-09-01"),
      },
    },
    // 2. Legitimate ON_HOLD order missing OrderHold record
    {
      id: "ord-2",
      version: 1,
      status: "disputed",
      payoutHeld: true,
      paymentSimulationStatus: "ON_HOLD",
      holdReason: "Suspicious login",
      heldBy: "admin-1",
      heldAt: new Date("2026-09-02"),
      dispute: null,
    },
    // 3. Ambiguous order: payoutHeld is true, but no dispute and no ON_HOLD status
    {
      id: "ord-3",
      version: 1,
      status: "completed",
      payoutHeld: true,
      paymentSimulationStatus: "NORMAL",
      dispute: null,
    },
    // 4. Ambiguous order: dispute was APPROVE_REFUND, but status is completed
    {
      id: "ord-4",
      version: 1,
      status: "completed",
      payoutHeld: false,
      paymentSimulationStatus: "NORMAL",
      dispute: {
        id: "disp-4",
        status: "DECIDED",
        decision: "APPROVE_REFUND",
      },
    },
  ];

  const createdRecords = [];
  const mockDb = {
    order: {
      findMany: async () => mockOrders,
      findUnique: async ({ where }) => ({
        ...mockOrders.find((order) => order.id === where.id),
        holds: [],
      }),
      updateMany: async () => {
        throw new Error("this fixture has no healable orders");
      },
    },
    orderHold: {
      findMany: async () => {
        // No existing holds in DB for this test
        return [];
      },
      createMany: async ({ data }) => {
        createdRecords.push(...data);
        return { count: data.length };
      },
    },
  };
  mockDb.$transaction = async (callback) => callback(mockDb);

  // Run backfill (non-dryRun)
  const result = await backfillAndValidateHolds({ dryRun: false, db: mockDb });

  assert.equal(result.scannedOrdersCount, 4);
  assert.equal(result.createdHoldsCount, 2);
  assert.equal(createdRecords.length, 2);

  // Check dispute hold
  const disputeHold = createdRecords.find((r) => r.source === "DISPUTE");
  assert.equal(disputeHold.orderId, "ord-1");
  assert.equal(disputeHold.referenceId, "disp-1");

  // Check T&S hold
  const tsHold = createdRecords.find((r) => r.source === "TRUST_AND_SAFETY");
  assert.equal(tsHold.orderId, "ord-2");
  assert.equal(tsHold.referenceId, "admin-hold");

  // Check ambiguous orders
  assert.equal(result.ambiguousOrdersCount, 2);
  const issues = result.ambiguousOrders.map((o) => o.issue);
  assert.ok(issues.includes("PAYOUT_HELD_WITHOUT_ACTIVE_SOURCE"));
  assert.ok(issues.includes("REFUND_DECIDED_BUT_STATUS_NOT_REFUNDED"));
});

test("holdBackfillService heals an open dispute with CAS and preserves its prior status", async () => {
  const scanned = {
    id: "ord-heal",
    version: 4,
    status: "shipped",
    preDisputeStatus: null,
    payoutHeld: false,
    paymentSimulationStatus: "NORMAL",
    dispute: {
      id: "disp-heal",
      status: "OPEN",
      reason: "Item mismatch",
      openedBy: "buyer-1",
      createdAt: new Date("2026-09-19"),
    },
  };
  let updateCall;
  const db = {
    order: {
      findMany: async () => [scanned],
      findUnique: async () => ({ ...scanned, holds: [] }),
      updateMany: async (payload) => {
        updateCall = payload;
        return { count: 1 };
      },
    },
    orderHold: {
      findMany: async () => [],
      createMany: async ({ data }) => ({ count: data.length }),
    },
  };
  db.$transaction = async (callback) => callback(db);

  const result = await backfillAndValidateHolds({ db });

  assert.equal(result.createdHoldsCount, 1);
  assert.equal(result.updatedOrdersCount, 1);
  assert.equal(updateCall.where.version, 4);
  assert.equal(updateCall.where.status, "shipped");
  assert.deepEqual(updateCall.where.dispute.is.status.in, [
    "OPEN",
    "NEEDS_INFO",
  ]);
  assert.equal(updateCall.data.preDisputeStatus, "shipped");
  assert.equal(updateCall.data.status, "disputed");
  assert.equal(updateCall.data.payoutHeld, true);
});

test("holdBackfillService does not resurrect a dispute decided after the scan", async () => {
  const scanned = {
    id: "ord-decided",
    version: 2,
    status: "completed",
    payoutHeld: false,
    paymentSimulationStatus: "NORMAL",
    dispute: { id: "disp-decided", status: "OPEN" },
  };
  let writes = 0;
  const db = {
    order: {
      findMany: async () => [scanned],
      findUnique: async () => ({
        ...scanned,
        version: 3,
        dispute: { id: "disp-decided", status: "DECIDED", decision: "REJECT" },
        holds: [],
      }),
      updateMany: async () => {
        writes += 1;
        return { count: 1 };
      },
    },
    orderHold: {
      findMany: async () => [],
      createMany: async () => {
        writes += 1;
        return { count: 1 };
      },
    },
  };
  db.$transaction = async (callback) => callback(db);

  const result = await backfillAndValidateHolds({ db });

  assert.equal(writes, 0);
  assert.equal(result.createdHoldsCount, 0);
  assert.equal(result.updatedOrdersCount, 0);
});
