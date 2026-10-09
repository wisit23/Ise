const test = require("node:test");
const assert = require("node:assert/strict");
const { backfillAndValidateHolds } = require("./holdBackfillService");
test("dry run reports missing dispute holds without writing or inventing payment data", async () => {
  const orders = [
    {
      id: "o1",
      status: "disputed",
      dispute: { id: "c1", decision: null },
      payments: [{ paymentStatus: "paid", holds: [] }],
    },
    {
      id: "o2",
      status: "disputed",
      dispute: { id: "c2", decision: null },
      payments: [],
    },
    {
      id: "o3",
      status: "completed",
      dispute: { decision: "APPROVE_REFUND" },
      payments: [],
    },
  ];
  const result = await backfillAndValidateHolds({
    dryRun: true,
    db: { order: { findMany: async () => orders } },
  });
  assert.equal(result.createdHoldsCount, 1);
  assert.deepEqual(result.createdHolds[0], {
    orderId: "o1",
    source: "DISPUTE",
    referenceId: "c1",
  });
  assert.deepEqual(
    result.ambiguousOrders.map((o) => o.issue),
    [
      "OPEN_DISPUTE_WITHOUT_PAID_PAYMENT",
      "REFUND_DECIDED_BUT_STATUS_NOT_REFUNDED",
    ],
  );
});
test("refund with another active reason is valid and must remain frozen", async () => {
  const result = await backfillAndValidateHolds({
    dryRun: true,
    db: {
      order: {
        findMany: async () => [
          {
            id: "o1",
            status: "disputed",
            dispute: { decision: "APPROVE_REFUND" },
            payments: [
              { holds: [{ source: "TRUST_AND_SAFETY", releaseAt: null }] },
            ],
          },
        ],
      },
    },
  });
  assert.equal(result.ambiguousOrdersCount, 0);
});
test("backfill does not resurrect a case decided after initial scan", async () => {
  const scanned = {
    id: "o1",
    status: "completed",
    dispute: { id: "c1", decision: null },
    payments: [{ paymentStatus: "paid", holds: [] }],
  };
  const db = {
    order: {
      findMany: async () => [scanned],
      findUnique: async () => ({ ...scanned, dispute: { decision: "REJECT" } }),
    },
  };
  db.$transaction = async (cb) => cb(db);
  const result = await backfillAndValidateHolds({ db });
  assert.equal(result.createdHoldsCount, 0);
  assert.equal(result.updatedOrdersCount, 0);
});
