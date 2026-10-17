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
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

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

  // Two customers created inside the window; one of them logs in twice
  // inside the window (still counts once — activeUsers is distinct by user),
  // the other logs in outside the window (must not count). Staff accounts,
  // and a buyer promoted to staff, are not customers: neither their logins nor
  // their sign-ups count. A seller and a buyer-and-seller do count.
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

  const makeUser = (name, role) =>
    prisma.user.create({
      data: {
        email: `${FIXTURE_EMAIL_PREFIX}${name}-${runId}@example.test`,
        passwordHash,
        firstName: "Metrics",
        lastName: name,
        role,
        createdAt: insideWindow,
      },
    });
  const seller = await makeUser("seller", "SELLER");
  const staff = await makeUser("staff", "CUSTOMER_SERVICE");
  const executive = await makeUser("executive", "EXECUTIVE");
  // Legacy role says buyer, but a role row makes the account a staff account.
  const promoted = await makeUser("promoted", "BUYER");
  await prisma.userRole.create({
    data: { userId: promoted.id, role: "ADMIN" },
  });
  // A customer with role rows: both customer roles still count once.
  const both = await makeUser("both", "BUYER");
  await prisma.userRole.createMany({
    data: [
      { userId: both.id, role: "BUYER" },
      { userId: both.id, role: "SELLER" },
    ],
  });
  const allUsers = [userA, userB, seller, staff, executive, promoted, both];

  try {
    await prisma.loginLog.createMany({
      data: [
        { userId: userA.id, loginAt: insideWindow },
        { userId: userA.id, loginAt: insideWindow },
        { userId: userB.id, loginAt: outsideWindow },
        { userId: seller.id, loginAt: insideWindow },
        { userId: staff.id, loginAt: insideWindow },
        { userId: executive.id, loginAt: insideWindow },
        { userId: promoted.id, loginAt: insideWindow },
        { userId: both.id, loginAt: insideWindow },
        { userId: both.id, loginAt: insideWindow },
      ],
    });

    const res = await request(app)
      .get("/executive/metrics")
      .query({ from: windowFrom.toISOString(), to: windowTo.toISOString() })
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(res.status, 200);
    // Customers only: A, the seller and the buyer-and-seller log in inside the
    // window (3); A, B, the seller and the buyer-and-seller sign up (4).
    assert.deepEqual(res.body.data, { activeUsers: 3, newUsers: 4 });
    assert.equal(res.body.meta.definitionVersion, "v1");
    assert.equal(res.body.meta.timezone, "Asia/Bangkok");

    const forbiddenRes = await request(app)
      .get("/executive/metrics")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get("/executive/metrics");
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    const ids = allUsers.map((u) => u.id);
    await prisma.loginLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
