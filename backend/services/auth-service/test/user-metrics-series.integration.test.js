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

const FIXTURE_EMAIL_PREFIX = "mock-trade-metrics-series-user-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive user metrics series against a real database", async (t) => {
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

  const day5 = new Date("2019-03-05T10:00:00.000Z");
  const day10 = new Date("2019-03-10T10:00:00.000Z");

  const userA = await prisma.user.create({
    data: {
      email: `${FIXTURE_EMAIL_PREFIX}a-${runId}@example.test`,
      passwordHash,
      firstName: "Series",
      lastName: "UserA",
    },
  });
  const userB = await prisma.user.create({
    data: {
      email: `${FIXTURE_EMAIL_PREFIX}b-${runId}@example.test`,
      passwordHash,
      firstName: "Series",
      lastName: "UserB",
    },
  });

  try {
    await prisma.loginLog.createMany({
      data: [
        // Two logins by the same user on day 5 still count once that day.
        { userId: userA.id, loginAt: day5 },
        { userId: userA.id, loginAt: day5 },
        { userId: userB.id, loginAt: day5 },
        { userId: userA.id, loginAt: day10 },
      ],
    });

    const res = await request(app)
      .get("/executive/metrics-series")
      .query({
        from: "2019-03-01T00:00:00.000Z",
        to: "2019-04-01T00:00:00.000Z",
        granularity: "day",
      })
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 31);

    const day1Row = res.body.data.find(
      (r) => r.period === "2019-03-01T00:00:00.000Z",
    );
    assert.deepEqual(day1Row, {
      period: "2019-03-01T00:00:00.000Z",
      activeUsers: 0,
    });

    const day5Row = res.body.data.find(
      (r) => r.period === "2019-03-05T00:00:00.000Z",
    );
    assert.equal(day5Row.activeUsers, 2, "distinct users, not login count");

    const day10Row = res.body.data.find(
      (r) => r.period === "2019-03-10T00:00:00.000Z",
    );
    assert.equal(day10Row.activeUsers, 1);

    assert.equal(res.body.meta.definitionVersion, "v1");

    const badGranularityRes = await request(app)
      .get("/executive/metrics-series")
      .query({ granularity: "week" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(badGranularityRes.status, 400);

    const forbiddenRes = await request(app)
      .get("/executive/metrics-series")
      .query({ granularity: "day" })
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get(
      "/executive/metrics-series",
    );
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
