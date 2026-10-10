const test = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/models/prismaClient");
const reportService = require("../src/features/reports/reportService");

test("user safety history paginates reports and links moderation actions to source reports", async (t) => {
  const originals = {
    reportFindMany: prisma.report.findMany,
    reportCount: prisma.report.count,
    auditCount: prisma.adminAudit.count,
    auditFindMany: prisma.adminAudit.findMany,
  };
  t.after(() => {
    prisma.report.findMany = originals.reportFindMany;
    prisma.report.count = originals.reportCount;
    prisma.adminAudit.count = originals.auditCount;
    prisma.adminAudit.findMany = originals.auditFindMany;
  });
  let reportFindManyQuery;
  prisma.report.findMany = async (query) => {
    reportFindManyQuery = query;
    return [
      {
        id: "report-1",
        targetId: "user-1",
        reason: "fraud",
        status: "ACTIONED",
      },
    ];
  };
  prisma.report.count = async () => 3;
  prisma.adminAudit.count = async () => 1;
  prisma.adminAudit.findMany = async (query) => {
    if (query.where.requestId) {
      return [{ requestId: "request-1", targetId: "report-1" }];
    }
    return [
      {
        id: "audit-1",
        targetId: "user-1",
        action: "USER_WARNED",
        reason: "confirmed abuse",
        requestId: "request-1",
      },
    ];
  };

  const reports = await reportService.listUserHistory({
    targetId: "user-1",
    kind: "reports",
    page: 2,
    limit: 1,
  });
  assert.equal(reports.total, 3);
  assert.equal(reports.items[0].id, "report-1");
  assert.equal(reportFindManyQuery.skip, 1);

  const actions = await reportService.listUserHistory({
    targetId: "user-1",
    kind: "actions",
    page: 1,
    limit: 5,
  });
  assert.equal(actions.items[0].sourceReportId, "report-1");
});

test("general user lookup selects and returns no full KYC identifiers", async (t) => {
  let lookupQuery;
  const originals = {
    userFindFirst: prisma.user.findFirst,
    reportCount: prisma.report.count,
    auditCount: prisma.adminAudit.count,
  };
  t.after(() => {
    prisma.user.findFirst = originals.userFindFirst;
    prisma.report.count = originals.reportCount;
    prisma.adminAudit.count = originals.auditCount;
  });
  prisma.user.findFirst = async (query) => {
    lookupQuery = query;
    return {
      id: "user-1",
      email: "seller@example.test",
      firstName: "Safe",
      lastName: "Seller",
      phone: "000",
      role: "SELLER",
      roles: [],
      status: "ACTIVE",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      sellerProfile: {
        shopName: "Safe Shop",
        kycStatus: "VERIFIED",
        verifiedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    };
  };
  prisma.report.count = async () => 0;
  prisma.adminAudit.count = async () => 0;

  const result = await reportService.getUserDetail("user-1");

  assert.deepEqual(lookupQuery.include.sellerProfile.select, {
    shopName: true,
    kycStatus: true,
    verifiedAt: true,
  });
  assert.equal(result.sellerProfile.shopName, "Safe Shop");
  assert.equal("idCardNumber" in result.sellerProfile, false);
  assert.equal("bankAccount" in result.sellerProfile, false);
  assert.equal("address" in result.sellerProfile, false);
});
