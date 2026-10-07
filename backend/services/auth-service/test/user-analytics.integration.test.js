// Integration test against a real, disposable Postgres database (reloop_auth) for UR-08.
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const bcrypt = require("bcryptjs");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_AUTH ||
    "postgresql://reloop:reloop_dev_password@localhost:5432/reloop_auth";
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

app.locals.validateAccessSession = async () => {};

const FIXTURE_PREFIX = "ur08-marketing-user-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("marketing user analytics against a real database (UR-08)", async (t) => {
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

  const marketingToken = signAccessToken({
    sub: `mkt-test-${runId}`,
    role: "MARKETING",
    roles: ["MARKETING"],
    permissions: ["analytics:read:marketing"],
    displayName: "Marketing Analyst",
  });
  const buyerToken = signAccessToken({
    sub: `buyer-test-${runId}`,
    role: "BUYER",
    roles: ["BUYER"],
    displayName: "Normal Buyer",
  });

  // Business Window in Asia/Bangkok (+07:00):
  // 2026-06-01 00:00:00+07:00 (2026-05-31T17:00:00.000Z) to 2026-06-01 06:00:00+07:00 (2026-05-31T23:00:00.000Z)

  const hour1 = new Date("2026-05-31T18:30:00.000Z"); // 2026-06-01 01:30 Bangkok
  const hour2 = new Date("2026-05-31T19:15:00.000Z"); // 2026-06-01 02:15 Bangkok
  const outsideWindow = new Date("2026-05-31T16:59:59.000Z"); // 2026-05-31 23:59:59 Bangkok

  // Create Users:
  // user1: created inside window, logs in at hour 1 & 2
  // user2: created inside window, activity at hour 2
  // user3: created outside window, logs in at hour 2
  // user4: created outside window, logs in outside window only
  const user1 = await prisma.user.create({
    data: {
      email: `${FIXTURE_PREFIX}1-${runId}@example.test`,
      passwordHash,
      firstName: "User1",
      lastName: "Test",
      createdAt: hour1,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: `${FIXTURE_PREFIX}2-${runId}@example.test`,
      passwordHash,
      firstName: "User2",
      lastName: "Test",
      createdAt: hour2,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: `${FIXTURE_PREFIX}3-${runId}@example.test`,
      passwordHash,
      firstName: "User3",
      lastName: "Test",
      createdAt: outsideWindow,
    },
  });

  const user4 = await prisma.user.create({
    data: {
      email: `${FIXTURE_PREFIX}4-${runId}@example.test`,
      passwordHash,
      firstName: "User4",
      lastName: "Test",
      createdAt: outsideWindow,
    },
  });

  try {
    // Seed LoginLogs:
    await prisma.loginLog.createMany({
      data: [
        { userId: user1.id, loginAt: hour1 },
        { userId: user1.id, loginAt: hour2 },
        { userId: user3.id, loginAt: hour2 },
        { userId: user4.id, loginAt: outsideWindow },
      ],
    });

    // Seed BuyerActivityLogs:
    await prisma.buyerActivityLog.createMany({
      data: [
        {
          buyerId: user2.id,
          action: "PRODUCT_VIEWED",
          source: "WEB",
          occurredAt: hour2,
        },
      ],
    });

    // 1. Marketing request with valid range in Asia/Bangkok
    const res = await request(app)
      .get("/marketing/analytics/user-usage")
      .query({
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-01T06:00:00+07:00",
        timezone: "Asia/Bangkok",
      })
      .set("Authorization", `Bearer ${marketingToken}`);

    assert.equal(res.status, 200);

    // Active users: user1, user2, user3 (user4 is outside window) -> 3 distinct users
    assert.equal(res.body.activeUsers, 3);
    // New users: user1, user2 (user3, user4 created outside window) -> 2 users
    assert.equal(res.body.newUsers, 2);

    // Hourly usage:
    // hour 00: 0
    // hour 01: user1 -> 1
    // hour 02: user1, user2, user3 -> 3 (Peak!)
    // hour 03: 0
    // hour 04: 0
    // hour 05: 0
    assert.equal(res.body.hourlyUsage.length, 6);
    assert.equal(res.body.hourlyUsage[0].hour, "2026-06-01T00:00:00+07:00");
    assert.equal(res.body.hourlyUsage[0].usageCount, 0);
    assert.equal(res.body.hourlyUsage[1].hour, "2026-06-01T01:00:00+07:00");
    assert.equal(res.body.hourlyUsage[1].usageCount, 1);
    assert.equal(res.body.hourlyUsage[2].hour, "2026-06-01T02:00:00+07:00");
    assert.equal(res.body.hourlyUsage[2].usageCount, 3);

    // Peak hour: hour 02:00:00 in Asia/Bangkok with 3 users
    assert.equal(res.body.peakHour.hour, "2026-06-01T02:00:00+07:00");
    assert.equal(res.body.peakHour.usageCount, 3);

    // Verify boundary [from, to) in Asia/Bangkok:
    assert.equal(res.body.range.from, "2026-06-01T00:00:00+07:00");
    assert.equal(res.body.range.to, "2026-06-01T06:00:00+07:00");
    assert.equal(res.body.range.timezone, "Asia/Bangkok");

    // Verify response has NO PII:
    assert.equal(res.body.email, undefined);
    assert.equal(res.body.phone, undefined);
    assert.equal(res.body.firstName, undefined);
    assert.equal(res.body.lastName, undefined);
    assert.equal(res.body.userId, undefined);

    // 2. Reject unsupported timezone
    const resTz = await request(app)
      .get("/marketing/analytics/user-usage")
      .query({
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-01T06:00:00+07:00",
        timezone: "America/New_York",
      })
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(resTz.status, 400);

    // 3. Authorization: Buyer receives 403 Forbidden
    const resBuyer = await request(app)
      .get("/marketing/analytics/user-usage")
      .query({
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-01T06:00:00+07:00",
      })
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(resBuyer.status, 403);

    // 4. Authorization: Missing token receives 401
    const resNoAuth = await request(app)
      .get("/marketing/analytics/user-usage")
      .query({
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-01T06:00:00+07:00",
      });
    assert.equal(resNoAuth.status, 401);

    // 5. Non-integral hour range: preserves minutes and seconds in response range
    const resNonIntegral = await request(app)
      .get("/marketing/analytics/user-usage")
      .query({
        from: "2026-06-01T00:30:00+07:00",
        to: "2026-06-01T02:15:00+07:00",
        timezone: "Asia/Bangkok",
      })
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(resNonIntegral.status, 200);
    assert.equal(resNonIntegral.body.range.from, "2026-06-01T00:30:00+07:00");
    assert.equal(resNonIntegral.body.range.to, "2026-06-01T02:15:00+07:00");
    assert.equal(resNonIntegral.body.range.timezone, "Asia/Bangkok");
    // Hourly buckets must remain on the hour:
    for (const bucket of resNonIntegral.body.hourlyUsage) {
      assert.match(bucket.hour, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\+07:00$/);
    }

    // 6. Zero activity window: peakHour must return { hour: null, usageCount: 0 }
    const resEmptyWindow = await request(app)
      .get("/marketing/analytics/user-usage")
      .query({
        from: "2026-06-01T03:00:00+07:00",
        to: "2026-06-01T05:00:00+07:00",
        timezone: "Asia/Bangkok",
      })
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(resEmptyWindow.status, 200);
    assert.equal(resEmptyWindow.body.activeUsers, 0);
    assert.deepEqual(resEmptyWindow.body.peakHour, {
      hour: null,
      usageCount: 0,
    });
  } finally {
    // Cleanup fixtures
    const userIds = [user1.id, user2.id, user3.id, user4.id];
    await prisma.buyerActivityLog.deleteMany({
      where: { buyerId: { in: userIds } },
    });
    await prisma.loginLog.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
});
