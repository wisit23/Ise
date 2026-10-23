const test = require("node:test");
const assert = require("node:assert/strict");
const { listReports } = require("./reportService");

test("completed report history belongs to the authenticated staff and overrides pending filters", async (t) => {
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
