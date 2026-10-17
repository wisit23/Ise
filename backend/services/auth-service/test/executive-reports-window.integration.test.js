// Integration test against a real, disposable Postgres database (reloop_auth).
// Skips cleanly when DATABASE_URL is unset/unreachable; set REQUIRE_INTEGRATION=1
// to turn that skip into a hard failure instead.
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

const FIXTURE_EMAIL_PREFIX = "exec-reports-window-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive complaints can be listed for a date window", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = Date.now();
  const executiveToken = signAccessToken({
    sub: "int-test-executive",
    role: "EXECUTIVE",
    displayName: "Trusted Integration Executive",
  });
  const reporter = await prisma.user.create({
    data: {
      email: `${FIXTURE_EMAIL_PREFIX}${runId}@example.test`,
      passwordHash: await bcrypt.hash("password123", 4),
      firstName: "Window",
      lastName: "Reporter",
    },
  });

  // 2001 is far from any real data. Bangkok is UTC+7, so the Bangkok day of
  // 10 May 2001 runs from 2001-05-09T17:00Z.
  const rows = [
    ["A", "2001-05-10T05:00:00.000Z", "OPEN"],
    ["B", "2001-05-10T08:00:00.000Z", "ACTIONED"],
    ["C", "2001-05-11T05:00:00.000Z", "DISMISSED"],
    ["D", "2001-04-01T05:00:00.000Z", "OPEN"],
  ];
  const created = new Map();

  try {
    for (const [key, at, status] of rows) {
      const report = await prisma.report.create({
        data: {
          reporterId: reporter.id,
          targetId: `window-target-${runId}`,
          reason: `window ${key}`,
          status,
          reportedAt: new Date(at),
        },
      });
      created.set(report.id, key);
    }

    const get = (query) =>
      request(app)
        .get("/executive/reports")
        .query({ timezone: "Asia/Bangkok", status: "ALL", ...query })
        .set("Authorization", `Bearer ${executiveToken}`);
    const keys = (res) =>
      res.body.data.items.map((item) => created.get(item.id)).filter(Boolean);

    // One Bangkok day: A and B. C is the next day, D a month before.
    const day = await get({ from: "2001-05-10", to: "2001-05-11" });
    assert.equal(day.status, 200);
    assert.deepEqual(keys(day), ["B", "A"]);
    assert.equal(day.body.data.total, 2);
    assert.deepEqual(
      { OPEN: 1, ACTIONED: 1 },
      {
        OPEN: day.body.data.statusCounts.OPEN,
        ACTIONED: day.body.data.statusCounts.ACTIONED,
      },
    );
    // Counts describe the window, not every complaint ever filed.
    assert.equal(day.body.data.statusCounts.DISMISSED ?? 0, 0);
    assert.equal(day.body.meta.timezone, "Asia/Bangkok");
    assert.equal(day.body.meta.from, "2001-05-09T17:00:00.000Z");

    // A wider window, then the status filter inside it.
    const range = { from: "2001-05-10", to: "2001-05-12" };
    assert.deepEqual(keys(await get(range)), ["C", "B", "A"]);
    assert.deepEqual(keys(await get({ ...range, status: "DISMISSED" })), ["C"]);

    // Without a window it is still the live queue, as before.
    const live = await request(app)
      .get("/executive/reports")
      .query({ status: "ALL", search: `window-target-${runId}` })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(live.status, 200);
    assert.equal(live.body.meta.from, undefined);
    assert.equal(keys(live).length, 4);

    // A half-given or invalid window is refused.
    assert.equal(
      (await get({ from: "2001-05-10", to: undefined })).status,
      400,
    );
    assert.equal(
      (await get({ from: "not-a-date", to: "2001-05-11" })).status,
      400,
    );
  } finally {
    await prisma.report.deleteMany({
      where: { id: { in: [...created.keys()] } },
    });
    await prisma.user.deleteMany({ where: { id: reporter.id } });
    await prisma.$disconnect();
  }
});
