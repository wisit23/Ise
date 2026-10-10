const test = require("node:test");
const assert = require("node:assert/strict");

const calls = {};
const prisma = {
  $queryRaw: async () => [],
  $transaction: async (callback) => callback(prisma),
  report: {
    findMany: async (query) => {
      calls.findMany = query;
      return [{ id: "report-5" }];
    },
    count: async (query) => {
      calls.reportCount = query;
      return query?.where?.targetId ? 4 : 5;
    },
    findUnique: async () => ({
      id: "report-1",
      reporterId: "reporter-1",
      reporter: { id: "reporter-1", firstName: "Reporter" },
      targetId: "target-1",
      productId: "product-1",
      status: "DISMISSED",
      actionTaken: "DISMISS",
    }),
  },
  user: {
    findUnique: async ({ where }) =>
      where.id === "restricted-1"
        ? { id: where.id, status: "RESTRICTED_BUYER" }
        : { id: where.id, firstName: where.id, status: "ACTIVE" },
    update: async () => {
      calls.userUpdated = true;
      return { id: "restricted-1", status: "SUSPENDED" };
    },
  },
  refreshToken: {
    updateMany: async () => {
      calls.sessionsRevoked = true;
    },
  },
  adminAudit: {
    findFirst: async () => ({
      actorId: "admin-1",
      action: "REPORT_DISMISS",
      reason: "not a violation",
      createdAt: new Date("2026-10-08T01:00:00.000Z"),
    }),
    count: async () => 2,
  },
};

const prismaPath = require.resolve("../src/models/prismaClient");
const productClientPath =
  require.resolve("../src/services/productModerationClient");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prisma,
};
require.cache[productClientPath] = {
  id: productClientPath,
  filename: productClientPath,
  loaded: true,
  exports: {
    getProduct: async (id) => ({ id, title: "Evidence product" }),
  },
};

const reportService = require("../src/features/reports/reportService");

test("listReports applies independent page and search contract", async () => {
  const result = await reportService.listReports({
    page: 3,
    limit: 2,
    status: "OPEN",
    search: "counterfeit",
  });

  assert.equal(result.total, 5);
  assert.equal(calls.findMany.skip, 4);
  assert.equal(calls.findMany.take, 2);
  assert.equal(calls.findMany.where.status, "OPEN");
  assert.ok(
    calls.findMany.where.OR.some(
      (entry) => entry.reason?.contains === "counterfeit",
    ),
  );
});

test("an explicit empty status lists all reports", async () => {
  await reportService.listReports({ page: 1, limit: 15, status: "" });
  assert.equal("status" in calls.findMany.where, false);
});

test("getReportDetail returns people, product and the persisted decision", async () => {
  const detail = await reportService.getReportDetail("report-1");

  assert.equal(detail.reporter.id, "reporter-1");
  assert.equal(detail.target.id, "target-1");
  assert.equal(detail.productDetail.available, true);
  assert.equal(detail.productDetail.product.title, "Evidence product");
  assert.equal(detail.decision.action, "DISMISS");
  assert.equal(detail.decision.reason, "not a violation");
  assert.equal(detail.decision.decidedBy.id, "admin-1");
});

test("full suspension cannot overwrite a scoped commerce restriction", async () => {
  calls.userUpdated = false;
  calls.sessionsRevoked = false;

  await assert.rejects(
    reportService.suspendUser({
      targetId: "restricted-1",
      adminId: "admin-1",
      reason: "emergency suspension",
    }),
    (error) => error.status === 409 && /revoke/.test(error.message),
  );

  assert.equal(calls.userUpdated, false);
  assert.equal(calls.sessionsRevoked, false);
});
