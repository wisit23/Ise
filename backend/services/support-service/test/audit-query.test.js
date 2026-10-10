const test = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/models/prismaClient");
const { queryAudit } = require("../src/features/audit/auditQuery");

test("Support audit exposes ticket transitions with pagination and source case", async (t) => {
  const originals = {
    findMany: prisma.ticketAuditLog.findMany,
    count: prisma.ticketAuditLog.count,
  };
  t.after(() => {
    prisma.ticketAuditLog.findMany = originals.findMany;
    prisma.ticketAuditLog.count = originals.count;
  });
  let query;
  prisma.ticketAuditLog.findMany = async (value) => {
    query = value;
    return [
      {
        id: "ticket-event-1",
        ticketId: "ticket-1",
        actorId: "staff-1",
        action: "STATUS_CHANGE",
        fromValue: "IN_PROGRESS",
        toValue: "RESOLVED",
        reason: "resolved",
        dedupeKey: "ticket-operation-1",
        createdAt: new Date(),
        ticket: { ticketNumber: "CS-000001" },
      },
    ];
  };
  prisma.ticketAuditLog.count = async () => 20;

  const result = await queryAudit({
    page: 2,
    limit: 15,
    actorId: "staff-1",
    action: "STATUS_CHANGE",
    targetId: "ticket-1",
  });

  assert.equal(query.skip, 15);
  assert.equal(result.total, 20);
  assert.equal(result.items[0].source, "SUPPORT");
  assert.equal(result.items[0].caseId, "ticket-1");
  assert.equal(result.items[0].caseNumber, "CS-000001");
  assert.equal(result.items[0].operationId, "ticket-operation-1");
});
