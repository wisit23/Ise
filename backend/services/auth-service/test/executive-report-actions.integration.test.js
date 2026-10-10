const test = require("node:test");
const assert = require("node:assert/strict");

if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}
const prisma = require("../src/models/prismaClient");
const {
  getReportOverview,
} = require("../src/features/metrics/executiveReports");

test("executive report decisions resolve the matching audit and actual actor", async (t) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw error;
    t.skip("requires an isolated Auth PostgreSQL schema");
    await prisma.$disconnect();
    return;
  }
  const users = [];
  const reports = [];
  const audits = [];
  t.after(async () => {
    await prisma.adminAudit.deleteMany({ where: { id: { in: audits } } });
    await prisma.report.deleteMany({ where: { id: { in: reports } } });
    await prisma.sellerProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });
  async function user(name) {
    const row = await prisma.user.create({
      data: {
        email: `${name}-${Date.now()}@ceo-action.test`,
        passwordHash: "fixture",
        firstName: name,
        lastName: "Tester",
      },
    });
    users.push(row.id);
    return row;
  }
  const reporter = await user("Reporter");
  const reviewer = await user("Reviewer");
  const decider = await user("Decider");
  for (const [status, actionTaken] of [
    ["ACTIONED", "WARN_USER"],
    ["ACTIONED", "SUSPEND_USER"],
    ["ACTIONED", "REMOVE_PRODUCT"],
    ["DISMISSED", "DISMISS"],
    ["OPEN", null],
    ["REVIEWED", null],
    ["ACTIONED", "WARN_USER"],
  ]) {
    const row = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetId: reporter.id,
        reason: "Reporter reason",
        status,
        actionTaken,
        reviewedBy: reviewer.id,
      },
    });
    reports.push(row.id);
    if (reports.length <= 4) {
      for (const [targetId, action, actorId, reason] of [
        [row.id, `REPORT_${actionTaken}`, decider.id, "Actual decision reason"],
        [row.id, "REPORT_UNRELATED", reviewer.id, "Wrong report action"],
        [reporter.id, "USER_WARNED", reviewer.id, "Wrong user audit"],
      ]) {
        const audit = await prisma.adminAudit.create({
          data: { targetId, action, actorId, reason },
        });
        audits.push(audit.id);
      }
    }
    const result = await getReportOverview({ status, targetId: reporter.id });
    const item = result.items.find((item) => item.id === row.id);
    assert.equal(item.reason, "Reporter reason");
    assert.equal(item.actionTaken, actionTaken);
    if (reports.length <= 4) {
      assert.deepEqual(item.actionDetails, {
        actorId: decider.id,
        actorName: "Decider Tester",
        reason: "Actual decision reason",
      });
    } else {
      assert.equal(item.actionDetails, null);
    }
  }

  const shopA = await user("Alice");
  const shopB = await user("Bob");
  await prisma.sellerProfile.create({
    data: { userId: shopA.id, shopName: "Search Shop A" },
  });
  await prisma.sellerProfile.create({
    data: { userId: shopB.id, shopName: "Search Shop B" },
  });
  for (const status of [
    "OPEN",
    "OPEN",
    "OPEN",
    "REVIEWED",
    "ACTIONED",
    "DISMISSED",
  ]) {
    const row = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetId: shopA.id,
        reason: "Shop A complaint",
        status,
      },
    });
    reports.push(row.id);
  }
  const other = await prisma.report.create({
    data: {
      reporterId: reporter.id,
      targetId: shopB.id,
      reason: "Other shop",
      status: "OPEN",
    },
  });
  reports.push(other.id);
  const first = await getReportOverview({
    search: "search shop a",
    limit: 2,
    page: 1,
  });
  const second = await getReportOverview({
    search: "Search Shop A",
    limit: 2,
    page: 2,
  });
  assert.equal(first.total, 4);
  assert.equal(first.totalPages, 2);
  assert.equal(
    new Set([...first.items, ...second.items].map((item) => item.id)).size,
    4,
  );
  assert.ok(
    [...first.items, ...second.items].every(
      (item) => item.targetId === shopA.id,
    ),
  );
  for (const status of ["ACTIONED", "DISMISSED"]) {
    const found = await getReportOverview({ search: "Shop A", status });
    assert.equal(found.total, 1);
    assert.equal(found.items[0].status, status);
  }
  assert.equal((await getReportOverview({ search: "Alice Tester" })).total, 4);
  const all = await getReportOverview({ search: "Shop A", status: "ALL" });
  assert.equal(all.total, 6);
  assert.deepEqual([...new Set(all.items.map((item) => item.status))].sort(), [
    "ACTIONED",
    "DISMISSED",
    "OPEN",
    "REVIEWED",
  ]);
  assert.equal((await getReportOverview({ search: shopA.id })).total, 4);
  assert.equal((await getReportOverview({ search: "%' OR true --" })).total, 0);
  assert.equal((await getReportOverview({ search: "missing shop" })).total, 0);
  const ranked = await getReportOverview({
    search: "Search Shop",
    sortBy: "most_reported",
    limit: 1,
  });
  assert.equal(ranked.total, 5);
  assert.equal(ranked.items[0].targetId, shopA.id);

  for (const targetId of ["constructor", "__proto__"]) {
    const row = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetId,
        reason: "Unresolved target",
        status: "OPEN",
      },
    });
    reports.push(row.id);
    const result = await getReportOverview({ targetId });
    assert.equal(result.items[0].targetName, null);
    assert.equal(result.items[0].targetShopName, null);
    assert.equal(result.items[0].targetReportCount, 1);
  }
});
