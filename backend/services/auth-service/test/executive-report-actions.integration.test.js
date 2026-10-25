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
  // Every complaint below is reported from now on, so a window from here
  // keeps other suites' rows out of the counts.
  const since = new Date(Date.now() - 1000);
  const until = () => new Date(Date.now() + 60_000);
  const inWindow = (filters = {}) =>
    getReportOverview({
      range: { from: since, to: until() },
      limit: 100,
      ...filters,
    });
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
    const result = await inWindow({ status });
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
  // Only Shop A and Shop B's complaints from here on.
  const shopRows = new Set(reports.slice(-7));
  const shopItems = (result) =>
    result.items.filter((item) => shopRows.has(item.id));

  // The open queue (OPEN + REVIEWED) pages newest first without overlaps.
  const openQueue = shopItems(await inWindow());
  assert.equal(openQueue.length, 5);
  const page1 = await inWindow({ limit: 2, page: 1 });
  const page2 = await inWindow({ limit: 2, page: 2 });
  assert.equal(page1.totalPages, Math.ceil(page1.total / 2));
  assert.equal(
    new Set([...page1.items, ...page2.items].map((item) => item.id)).size,
    4,
  );
  for (const status of ["ACTIONED", "DISMISSED"]) {
    const found = shopItems(await inWindow({ status }));
    assert.equal(found.length, 1);
    assert.equal(found[0].status, status);
  }
  const all = shopItems(await inWindow({ status: "ALL" }));
  assert.equal(all.length, 7);
  assert.deepEqual([...new Set(all.map((item) => item.status))].sort(), [
    "ACTIONED",
    "DISMISSED",
    "OPEN",
    "REVIEWED",
  ]);
  // Names come with each row; Shop A was reported 6 times.
  const shopA1 = all.find((item) => item.targetId === shopA.id);
  assert.equal(shopA1.targetShopName, "Search Shop A");
  assert.equal(shopA1.targetReportCount, 6);

  // Search by who the complaint is about: shop name (any case, in part), the
  // person's name, or their user code. All 6 of Shop A's, none of Shop B's.
  const byShop = (search, status = "ALL") =>
    inWindow({ search, status }).then(shopItems);
  for (const search of ["search shop a", "SHOP A", "Alice Tester", "alice"]) {
    const found = await byShop(search);
    assert.equal(found.length, 6, search);
    assert.ok(
      found.every((item) => item.targetId === shopA.id),
      search,
    );
  }
  const alice = await prisma.user.findUniqueOrThrow({
    where: { id: shopA.id },
    select: { referenceCode: true },
  });
  assert.equal((await byShop(alice.referenceCode)).length, 6);
  assert.equal((await byShop(alice.referenceCode.slice(4, 8))).length, 6);
  assert.equal((await byShop("Search Shop B")).length, 1);
  // The same box finds a complaint by its own code.
  const aComplaint = all.find((item) => item.targetId === shopA.id);
  const own = await byShop(aComplaint.referenceCode.toLowerCase());
  assert.deepEqual(
    own.map((item) => item.id),
    [aComplaint.id],
  );
  // Text is read literally: no pattern matches everything.
  for (const text of ["%", "_", "' OR 1=1 --", "no such shop"]) {
    assert.equal((await byShop(text)).length, 0, text);
  }

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
    const item = (await inWindow()).items.find((i) => i.id === row.id);
    assert.equal(item.targetName, null);
    assert.equal(item.targetShopName, null);
    assert.equal(item.targetReportCount, 1);
  }
});
