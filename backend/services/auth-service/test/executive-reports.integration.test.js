// Integration test against a real, disposable Postgres database (reloop_auth).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const bcrypt = require("bcryptjs");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const FIXTURE_EMAIL_PREFIX = "mock-trade-executive-reports-user-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive complaint feed against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/auth-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = Date.now();
  const passwordHash = await bcrypt.hash("password123", 4);
  const executiveToken = signAccessToken({
    sub: "int-test-executive",
    role: "EXECUTIVE",
    displayName: "Trusted Integration Executive",
  });
  const buyerToken = signAccessToken({
    sub: "int-test-buyer",
    role: "BUYER",
    displayName: "Trusted Integration Buyer",
  });

  const reporter = await prisma.user.create({
    data: {
      email: `${FIXTURE_EMAIL_PREFIX}${runId}@example.test`,
      passwordHash,
      firstName: "Complaint",
      lastName: "Reporter",
    },
  });

  const reportedTarget = `mock-trade-reported-target-${runId}`;
  const createdIds = [];

  try {
    // Two OPEN complaints about the same target (so topReported has a real
    // repeat offender), one DISMISSED that must stay out of the open feed.
    for (const [reason, status, targetId] of [
      ["ไม่จัดส่งสินค้าหลังชำระเงิน", "OPEN", reportedTarget],
      ["สินค้าไม่ตรงปก", "OPEN", reportedTarget],
      ["เรื่องที่ปิดไปแล้ว", "DISMISSED", `other-target-${runId}`],
    ]) {
      const created = await prisma.report.create({
        data: { reporterId: reporter.id, targetId, reason, status },
      });
      createdIds.push(created.id);
    }

    const res = await request(app)
      .get("/executive/reports")
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.meta.definitionVersion, "v1");

    const fixtureItems = res.body.data.items.filter((item) =>
      createdIds.includes(item.id),
    );
    // The DISMISSED one is excluded from the default (open) feed.
    assert.equal(fixtureItems.length, 2);
    assert.ok(
      fixtureItems.every((item) => item.status === "OPEN"),
      "default feed should only carry open complaints",
    );
    assert.equal(fixtureItems[0].reporterName, "Complaint Reporter");

    const repeat = res.body.data.topReported.find(
      (row) => row.targetId === reportedTarget,
    );
    assert.equal(repeat.count, 2, "a repeatedly reported target is surfaced");

    // Explicit status filter reaches the dismissed row.
    const dismissedRes = await request(app)
      .get("/executive/reports")
      .query({ status: "DISMISSED" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(dismissedRes.status, 200);
    assert.ok(
      dismissedRes.body.data.items.some((item) => createdIds.includes(item.id)),
    );

    const badStatusRes = await request(app)
      .get("/executive/reports")
      .query({ status: "NOT_A_STATUS" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(badStatusRes.status, 400);

    const forbiddenRes = await request(app)
      .get("/executive/reports")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get("/executive/reports");
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    await prisma.report.deleteMany({ where: { reporterId: reporter.id } });
    await prisma.user.delete({ where: { id: reporter.id } });
    await prisma.$disconnect();
  }
});
