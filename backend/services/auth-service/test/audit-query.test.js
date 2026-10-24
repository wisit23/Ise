const test = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/models/prismaClient");
const { queryAudit } = require("../src/features/audit/auditQuery");

test("Auth audit uses the real action catalog and returns the normalized contract", async (t) => {
  const originals = {
    findMany: prisma.adminAudit.findMany,
    count: prisma.adminAudit.count,
  };
  t.after(() => {
    prisma.adminAudit.findMany = originals.findMany;
    prisma.adminAudit.count = originals.count;
  });
  let capturedWhere;
  prisma.adminAudit.findMany = async (query) => {
    capturedWhere = query.where;
    return [
      {
        id: "audit-1",
        actorId: "staff-1",
        action: "USER_WARNED",
        targetId: "user-1",
        reason: "confirmed abuse",
        requestId: "request-1",
        createdAt: new Date("2026-10-09T01:00:00.000Z"),
      },
    ];
  };
  prisma.adminAudit.count = async () => 1;

  const result = await queryAudit({
    page: 1,
    limit: 15,
    action: "USER_WARNED",
    from: "2026-10-09T00:00:00.000Z",
    to: "2026-10-09T23:59:59.999Z",
  });

  assert.equal(capturedWhere.action, "USER_WARNED");
  assert.ok(capturedWhere.createdAt.gte instanceof Date);
  assert.equal(result.total, 1);
  assert.deepEqual(
    {
      source: result.items[0].source,
      eventId: result.items[0].eventId,
      targetType: result.items[0].targetType,
      requestId: result.items[0].requestId,
    },
    {
      source: "AUTH",
      eventId: "audit-1",
      targetType: "USER",
      requestId: "request-1",
    },
  );
});

test("Auth report actions link to their source report", async (t) => {
  const originals = {
    findMany: prisma.adminAudit.findMany,
    count: prisma.adminAudit.count,
    reports: prisma.report.findMany,
  };
  t.after(() => {
    prisma.adminAudit.findMany = originals.findMany;
    prisma.adminAudit.count = originals.count;
    prisma.report.findMany = originals.reports;
  });
  prisma.adminAudit.findMany = async () => [
    {
      id: "audit-report",
      actorId: "staff-1",
      action: "REPORT_DISMISS",
      targetId: "report-1",
      reason: "not actionable",
      requestId: null,
      createdAt: new Date(),
    },
  ];
  prisma.adminAudit.count = async () => 1;
  prisma.report.findMany = async () => [{ id: "report-1", productId: null, reason: "shop complaint" }];

  const { items } = await queryAudit({ page: 1, limit: 15 });
  assert.equal(items[0].targetType, "REPORT");
  assert.equal(items[0].caseId, "report-1");
  assert.equal(items[0].reportType, "SHOP");
});

test("audit report sources distinguish products and reviews and do not guess missing reports", async (t) => {
  const originals = { audits: prisma.adminAudit.findMany, count: prisma.adminAudit.count, reports: prisma.report.findMany };
  t.after(() => { prisma.adminAudit.findMany = originals.audits; prisma.adminAudit.count = originals.count; prisma.report.findMany = originals.reports; });
  prisma.adminAudit.findMany = async () => ["product", "review", "legacy-review", "missing"].map((id) => ({ id, action: "REPORT_REVIEWED", targetId: id }));
  prisma.adminAudit.count = async () => 4;
  let reportQuery;
  prisma.report.findMany = async (query) => {
    reportQuery = query;
    return [
      { id: "product", productId: "p-1", reason: "สินค้าไม่เหมาะสม" },
      { id: "review", productId: "p-1", reason: "[รายงานรีวิว #r-1] สแปม" },
      { id: "legacy-review", productId: null, reason: "เนื้อหารีวิวไม่เหมาะสม" },
    ];
  };
  const { items } = await queryAudit({ page: 1, limit: 15 });
  assert.deepEqual(items.map((item) => item.reportType), ["PRODUCT", "REVIEW", "REVIEW", null]);
  assert.deepEqual(reportQuery.select, { id: true, productId: true, reason: true });
});
