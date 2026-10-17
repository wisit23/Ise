const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { STATE_FIELDS } = require("../src/models/disputeWorkflowClient");

function testDatabase() {
  const value = process.env.DATABASE_URL_ORDER;
  if (!value) return false;
  const url = new URL(value);
  return (
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    /^\/reloop_(ui|ci)_[a-z0-9_]+$/.test(url.pathname)
  );
}

test("17 dispute workflow fields round-trip through logs, CAS and rollback", async (t) => {
  if (!testDatabase()) {
    t.skip(
      "Requires a disposable localhost reloop_ui_* or reloop_ci_* DATABASE_URL_ORDER",
    );
    return;
  }
  const db = require("../src/models/prismaClient");
  const tag = `workflow-${randomUUID()}`;
  const orderIds = [tag, `${tag}-other`];
  t.after(async () => {
    await db.disputeCaseLog.deleteMany({
      where: { dispute: { orderId: { in: orderIds } } },
    });
    await db.disputeCase.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.$disconnect();
  });
  for (const id of orderIds)
    await db.order.create({
      data: {
        id,
        buyerId: "buyer",
        sellerId: "seller",
        productId: "product",
        orderType: "BUY_NOW",
        originalAmount: "123.45",
        ordersAmount: "123.45",
        status: "disputed",
      },
    });
  const time = new Date("2026-10-01T08:00:00.123Z");
  const state = {
    status: "NEEDS_INFO",
    createdAt: time,
    assignedRole: "CUSTOMER_SERVICE",
    decisionReason: "reason",
    decidedBy: "reviewer",
    decidedAt: time,
    verdictKey: tag,
    escalationNote: "note",
    escalatedBy: "agent",
    priority: "HIGH",
    priorityScore: 42,
    riskReportCount: 3,
    slaExpiresAt: time,
    slaPolicyVersion: "v1",
    firstReviewDueAt: time,
    firstReviewedAt: time,
    decisionDueAt: time,
  };
  assert.equal(Object.keys(state).length, 17);
  const row = await db.disputeCase.create({
    data: {
      orderId: tag,
      createdBy: "buyer",
      reason: "wrong item",
      disputeType: "ITEM_NOT_AS_DESCRIBED",
      ...state,
    },
  });
  for (const key of STATE_FIELDS) assert.deepEqual(row[key], state[key], key);
  const read = await db.disputeCase.findUnique({ where: { verdictKey: tag } });
  for (const key of STATE_FIELDS) assert.deepEqual(read[key], state[key], key);
  const {
    disputeDashboardBase,
  } = require("../src/features/disputes/agentDashboard");
  const dashboardRows = await db.$queryRaw(disputeDashboardBase("agent"));
  assert.ok(
    dashboardRows.some(
      (item) => item.id === row.id && item.priority_score === 42,
    ),
  );

  const columns =
    await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='dispute_case'`;
  // operational_storage moved the 17 workflow fields back onto dispute_case
  // (9 core columns + 17), so they are real columns now.
  assert.equal(columns.length, 26);
  assert.ok(columns.some((column) => column.column_name === "dispute_case_id"));
  assert.ok(columns.some((column) => column.column_name === "status"));

  const results = await Promise.all([
    db.disputeCase.updateMany({
      where: { id: row.id, version: 0 },
      data: {
        assignedTo: "agent-a",
        assignedRole: "ADMIN",
        version: { increment: 1 },
      },
    }),
    db.disputeCase.updateMany({
      where: { id: row.id, version: 0 },
      data: {
        assignedTo: "agent-b",
        assignedRole: "ADMIN",
        version: { increment: 1 },
      },
    }),
  ]);
  assert.equal(
    results.reduce((sum, result) => sum + result.count, 0),
    1,
  );
  const after = await db.disputeCase.findUnique({ where: { id: row.id } });
  assert.equal(after.version, 1);
  assert.equal(after.assignedRole, "ADMIN");
  assert.ok(["agent-a", "agent-b"].includes(after.assignedTo));

  const countStates = async () =>
    (
      await db.$queryRaw`SELECT count(*)::integer AS count FROM dispute_case_log WHERE dispute_case_id=${row.id} AND action='WORKFLOW_STATE'`
    )[0].count;
  const count = await countStates();
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.disputeCase.updateMany({
        where: { id: row.id, version: 1 },
        data: {
          status: "DECIDED",
          decision: "REFUND",
          version: { increment: 1 },
        },
      });
      throw new Error("rollback marker");
    }),
    /rollback marker/,
  );
  assert.equal(await countStates(), count);
  const rolledBack = await db.disputeCase.findUnique({ where: { id: row.id } });
  assert.equal(rolledBack.version, 1);
  assert.equal(rolledBack.status, "NEEDS_INFO");
  assert.equal(rolledBack.decision, null);

  // State lives in dispute_case columns now, so a state update no longer
  // appends a WORKFLOW_STATE log row (the old log-backed write path is gone).
  assert.equal(count, 0);

  await assert.rejects(
    db.disputeCase.create({
      data: {
        orderId: orderIds[1],
        createdBy: "buyer",
        reason: "other",
        disputeType: "ITEM_NOT_AS_DESCRIBED",
        verdictKey: tag,
      },
    }),
    (error) => error.code === "P2002",
  );
  assert.equal(
    await db.disputeCase.findUnique({ where: { orderId: orderIds[1] } }),
    null,
  );

  const other = await db.disputeCase.create({
    data: {
      orderId: orderIds[1],
      createdBy: "buyer",
      reason: "other",
      disputeType: "ITEM_NOT_AS_DESCRIBED",
    },
  });
  const competingKey = `${tag}-new-key`;
  const verdictResults = await Promise.allSettled([
    db.disputeCase.updateMany({
      where: { id: row.id, version: 1 },
      data: { verdictKey: competingKey, version: { increment: 1 } },
    }),
    db.disputeCase.updateMany({
      where: { id: other.id, version: 0 },
      data: { verdictKey: competingKey, version: { increment: 1 } },
    }),
  ]);
  assert.equal(
    verdictResults.filter(
      (item) => item.status === "fulfilled" && item.value.count === 1,
    ).length,
    1,
  );
  assert.equal(
    verdictResults.filter(
      (item) => item.status === "rejected" && item.reason.code === "P2002",
    ).length,
    1,
  );
  assert.equal(
    await db.disputeCase.count({ where: { verdictKey: competingKey } }),
    1,
  );

  const log = await db.disputeCaseLog.create({
    data: {
      disputeCaseId: row.id,
      actorId: "agent",
      action: "REASSIGN",
      detail: "original plain text",
      fromAssignedRole: "CUSTOMER_SERVICE",
      toAssignedRole: "ADMIN",
    },
  });
  assert.equal(log.detail, "original plain text");
  assert.equal(log.fromAssignedRole, "CUSTOMER_SERVICE");
  const publicLogs = await db.disputeCaseLog.findMany({
    where: { disputeCaseId: row.id },
  });
  assert.equal(publicLogs.length, 1);
  assert.equal(publicLogs[0].detail, "original plain text");
  assert.equal(publicLogs[0].toAssignedRole, "ADMIN");
  assert.equal(
    await db.disputeCaseLog.count({ where: { disputeCaseId: row.id } }),
    1,
  );
  const audit = require("../src/features/support/auditService");
  const events = await audit.queryDisputeAudit({
    page: 1,
    limit: 20,
    caseId: row.id,
  });
  assert.equal(events.total, 1);
  assert.equal(events.items[0].reason, "original plain text");
  assert.equal(events.items[0].caseId, row.id);
  assert.equal(
    await db.disputeCase.count({
      where: { priorityScore: { gte: 42 }, id: row.id },
    }),
    1,
  );
});
