const test = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/models/prismaClient");
const auditService = require("../src/features/support/auditService");

test("Order hold audit is paginated by its owner table and links a dispute case", async (t) => {
  const originals = {
    findMany: prisma.disputeAudit.findMany,
    count: prisma.disputeAudit.count,
    caseFindMany: prisma.disputeCase.findMany,
  };
  t.after(() => {
    prisma.disputeAudit.findMany = originals.findMany;
    prisma.disputeAudit.count = originals.count;
    prisma.disputeCase.findMany = originals.caseFindMany;
  });
  let query;
  prisma.disputeAudit.findMany = async (value) => {
    query = value;
    return [
      {
        id: "hold-audit-1",
        orderId: "order-1",
        actorId: "staff-1",
        action: "HOLD",
        reason: "risk review",
        createdAt: new Date(),
      },
    ];
  };
  prisma.disputeAudit.count = async () => 2;
  prisma.disputeCase.findMany = async () => [
    { id: "dispute-1", orderId: "order-1" },
  ];

  const result = await auditService.queryAudit({
    kind: "holds",
    page: 2,
    limit: 1,
    action: "HOLD",
    targetId: "order-1",
  });

  assert.equal(query.skip, 1);
  assert.deepEqual(query.where, { action: "HOLD", orderId: "order-1" });
  assert.equal(result.total, 2);
  assert.equal(result.items[0].source, "ORDER_HOLD");
  assert.equal(result.items[0].caseId, "dispute-1");
});

test("Order dispute audit distinguishes evidence view from ordinary case opens", async (t) => {
  const originals = {
    findMany: prisma.disputeAuditLog.findMany,
    count: prisma.disputeAuditLog.count,
  };
  t.after(() => {
    prisma.disputeAuditLog.findMany = originals.findMany;
    prisma.disputeAuditLog.count = originals.count;
  });
  prisma.disputeAuditLog.findMany = async () => [
    {
      id: "event-1",
      disputeId: "dispute-1",
      actorId: "staff-1",
      action: "VIEW_EVIDENCE",
      detail: "evidence-1",
      createdAt: new Date(),
      dispute: { orderId: "order-1" },
    },
  ];
  prisma.disputeAuditLog.count = async () => 1;

  const result = await auditService.queryAudit({
    kind: "disputes",
    page: 1,
    limit: 15,
  });
  assert.equal(result.items[0].action, "VIEW_EVIDENCE");
  assert.equal(result.items[0].targetId, "order-1");
  assert.equal(result.items[0].caseId, "dispute-1");
});
