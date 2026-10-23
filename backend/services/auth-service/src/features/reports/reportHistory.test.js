const test = require("node:test");
const assert = require("node:assert/strict");
const { listReports } = require("./reportService");

test("completed report history belongs to the authenticated staff and overrides pending filters", async () => {
  let query, count;
  const db = { report: {
    findMany: async (options) => { query = options; return []; },
    count: async (options) => { count = options; return 0; },
  } };
  await listReports({ page: 2, limit: 15, status: "PENDING", scope: "history", staffId: "safety-1" }, db);
  assert.deepEqual(query.where, { reviewedBy: "safety-1", status: { in: ["ACTIONED", "DISMISSED"] } });
  assert.deepEqual(query.where, count.where);
  assert.equal(query.skip, 15);
  await assert.rejects(listReports({ page: 1, limit: 15, scope: "history" }), /staffId is required/);
});

test("report history uses the decision audit time rather than replacing the original report or claim date", async () => {
  const reportedAt = new Date("2026-10-21T01:00:00Z");
  const reviewedAt = new Date("2026-10-22T01:00:00Z");
  const decidedAt = new Date("2026-10-23T01:00:00Z");
  let decisionQuery;
  const db = {
    report: {
      findMany: async () => [{ id: "report-1", status: "ACTIONED", reportedAt, reviewedAt }, { id: "legacy", status: "DISMISSED", reportedAt, reviewedAt }],
      count: async () => 2,
    },
    adminAudit: { findMany: async (query) => { decisionQuery = query; return [{ targetId: "report-1", createdAt: decidedAt }]; } },
  };
  const { items } = await listReports({ page: 1, limit: 15, scope: "history", staffId: "staff-1" }, db);
  assert.equal(items[0].reportedAt, reportedAt);
  assert.equal(items[0].reviewedAt, reviewedAt);
  assert.equal(items[0].decidedAt, decidedAt);
  assert.equal(items[1].decidedAt, null);
  assert.equal(decisionQuery.where.action.not, "REPORT_REVIEWED");
});
