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

const FIXTURE_EMAIL_PREFIX = "mock-trade-executive-metrics-user-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive user metrics against a real database", async (t) => {
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

  const windowFrom = new Date("2026-01-01T00:00:00.000Z");
  const windowTo = new Date("2026-02-01T00:00:00.000Z");
  const insideWindow = new Date("2026-01-15T00:00:00.000Z");
  const outsideWindow = new Date("2025-12-15T00:00:00.000Z");

  // Two users created inside the window (newUsers=2); one of them logs in
  // twice inside the window (still counts once — activeUsers is distinct
  // by user), the other logs in outside the window (must not count).
  const userA = await prisma.user.create({
    data: {
      email: `${FIXTURE_EMAIL_PREFIX}a-${runId}@example.test`,
      passwordHash,
      firstName: "Metrics",
      lastName: "UserA",
      createdAt: insideWindow,
    },
  });
  const userB = await prisma.user.create({
    data: {
      email: `${FIXTURE_EMAIL_PREFIX}b-${runId}@example.test`,
      passwordHash,
      firstName: "Metrics",
      lastName: "UserB",
      createdAt: insideWindow,
    },
  });

  try {
    await prisma.loginLog.createMany({
      data: [
        { userId: userA.id, loginAt: insideWindow },
        { userId: userA.id, loginAt: insideWindow },
        { userId: userB.id, loginAt: outsideWindow },
      ],
    });

    const res = await request(app)
      .get("/executive/metrics")
      .query({ from: windowFrom.toISOString(), to: windowTo.toISOString() })
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { activeUsers: 1, newUsers: 2 });
    assert.equal(res.body.meta.definitionVersion, "v1");
    assert.equal(res.body.meta.timezone, "Asia/Bangkok");

    const forbiddenRes = await request(app)
      .get("/executive/metrics")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get("/executive/metrics");
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    await prisma.loginLog.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await prisma.$disconnect();
  }
});
