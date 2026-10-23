const test = require("node:test");
const assert = require("node:assert/strict");

const calls = {};
const prisma = {
  $queryRaw: async () => [],
  $transaction: async (callback) => callback(prisma),
  report: {
    create: async ({ data }) => {
      calls.createdReport = data;
      return { id: "new-report", ...data };
    },
    updateMany: async () => ({ count: 1 }),
    findMany: async (query) => {
      calls.findMany = query;
      return [{ id: "report-5" }];
    },
    count: async (query) => {
      calls.reportCount = query;
      return query?.where?.targetId ? 4 : 5;
    },
    findFirst: async (query) => {
      calls.findFirst = query;
      return null;
    },
    findUnique: async () => calls.currentReport || ({
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
    update: async ({ where, data }) => {
      calls.userUpdated = true;
      calls.userUpdateData = data;
      return { id: where.id, status: data.status };
    },
  },
  userRole: { findMany: async () => [{ role: "BUYER" }] },
  refreshToken: {
    updateMany: async () => {
      calls.sessionsRevoked = true;
    },
  },
  adminAudit: {
    create: async ({ data }) => {
      calls.auditActions?.push(data.action);
      return {};
    },
    findFirst: async () => ({
      actorId: "admin-1",
      action: "REPORT_DISMISS",
      reason: "not a violation",
      createdAt: new Date("2026-10-08T01:00:00.000Z"),
    }),
    count: async ({ where }) => {
      if (Array.isArray(where?.action?.in)) {
        calls.restrictionCountQuery = where;
        return 3;
      }
      return 2;
    },
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

test("new seller reports store their category and the reported product", async () => {
  await reportService.createReport({
    reporterId: "buyer-1", targetId: "seller-1", category: "FRAUD",
    productId: "product-9", reason: "  ร้านหลอกลวง  ",
  });
  assert.equal(calls.createdReport.category, "FRAUD");
  assert.equal(calls.createdReport.targetId, "seller-1");
  assert.equal(calls.createdReport.reason, "ร้านหลอกลวง");
  assert.equal(calls.createdReport.productId, "product-9");
  await assert.rejects(
    reportService.createReport({ reporterId: "buyer-1", targetId: "seller-1", reason: "test" }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    reportService.createReport({ reporterId: "buyer-1", targetId: "seller-1", category: "UNKNOWN", reason: "test" }),
    (error) => error.status === 400,
  );
});

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

test("report queue separates claimed and unclaimed work", async () => {
  await reportService.listReports({ page: 1, limit: 15, status: "PENDING", scope: "mine", staffId: "agent-1" });
  assert.equal(calls.findMany.where.reviewedBy, "agent-1");
  assert.deepEqual(calls.findMany.where.status, { in: ["OPEN", "REVIEWED"] });
  await reportService.listReports({ page: 1, limit: 15, status: "PENDING", scope: "unassigned", staffId: "agent-1" });
  assert.equal(calls.findMany.where.status, "OPEN");
});

test("a different staff member cannot decide a claimed report", async () => {
  calls.currentReport = { id: "report-1", status: "REVIEWED", reviewedBy: "agent-1", targetId: "target-1" };
  try {
    await assert.rejects(
      reportService.actionReport({ reportId: "report-1", staffId: "agent-2", decision: "WARN_USER", reason: "test" }),
      (error) => error.status === 403,
    );
  } finally { calls.currentReport = null; }
});

test("a claimed report can revoke buyer commerce rights in the same decision", async () => {
  calls.currentReport = { id: "report-1", status: "REVIEWED", reviewedBy: "admin-1", targetId: "target-1" };
  calls.userUpdated = false;
  try {
    await reportService.actionReport({ reportId: "report-1", staffId: "admin-1", decision: "RESTRICT_BUYER", reason: "confirmed abuse" });
    assert.equal(calls.userUpdated, true);
    assert.equal(calls.userUpdateData.status, "RESTRICTED_BUYER");
  } finally { calls.currentReport = null; }
});

test("report chat uses only a matching product conversation", async () => {
  calls.currentReport = { id: "report-1", reporterId: "reporter-1", targetId: "target-1", productId: "product-1" };
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes("by-context")) return new Response(JSON.stringify({ id: "chat-1", participants: [{ userId: "reporter-1" }, { userId: "target-1" }] }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ messages: [{ id: "msg-1", senderId: "reporter-1", body: "before report", createdAt: "2026-10-14T00:00:00Z" }], nextCursor: null }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const chat = await reportService.getReportChat({ reportId: "report-1" });
    assert.equal(chat.available, true);
    assert.equal(chat.messages[0].body, "before report");
  } finally { global.fetch = originalFetch; calls.currentReport = null; }
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

test("full suspension ends a scoped restriction and records both actions", async () => {
  calls.userUpdated = false;
  calls.sessionsRevoked = false;
  calls.auditActions = [];

  await reportService.suspendUser({
    targetId: "restricted-1",
    adminId: "admin-1",
    reason: "emergency suspension",
  });

  assert.equal(calls.userUpdateData.status, "SUSPENDED");
  assert.equal(calls.sessionsRevoked, true);
  assert.deepEqual(calls.auditActions, [
    "COMMERCE_RESTRICTION_REVOKED",
    "USER_SUSPENDED",
  ]);
});

test("bulk suspension preview accepts an account with scoped restriction", async () => {
  const { getAction } = require("../src/features/bulkActions/actionRegistry");
  const preview = await getAction("SUSPEND_USER").preview({
    id: "restricted-1",
    staffId: "admin-1",
  });
  assert.deepEqual(preview, { ok: true });
});

test("safety summary counts historical commerce restrictions", async () => {
  const summary = await reportService.getUserSafetySummary("restricted-1");
  assert.equal(summary.commerceRestrictionCount, 3);
  assert.equal(calls.restrictionCountQuery.targetId, "restricted-1");
  assert.deepEqual(calls.restrictionCountQuery.action.in, [
    "COMMERCE_RESTRICTED_BUYER",
    "COMMERCE_RESTRICTED_SELLER",
    "COMMERCE_RESTRICTED_ALL",
  ]);
});
