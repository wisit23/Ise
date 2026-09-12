const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive audit log endpoints against real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = Date.now();
  const actorId = `exec-${runId}`;
  const executiveToken = signAccessToken({
    sub: actorId,
    role: "EXECUTIVE",
    email: `ceo-${runId}@reloop.test`,
    displayName: "Integration CEO",
  });
  const buyerToken = signAccessToken({
    sub: `buyer-${runId}`,
    role: "BUYER",
    displayName: "Integration Buyer",
  });

  t.after(async () => {
    await prisma.executiveAuditLog.deleteMany({
      where: { actorId },
    });
    await prisma.$disconnect();
  });

  await t.test("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/executive/audit");
    assert.equal(res.status, 401);
  });

  await t.test("rejects non-executive roles with 403", async () => {
    const res = await request(app)
      .get("/executive/audit")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(res.status, 403);
  });

  await t.test("records a new executive audit log entry via POST", async () => {
    const payload = {
      action: "REPORT_EXPORT_CSV",
      category: "DATA_EXPORT",
      targetType: "report",
      targetId: "monthly-financials",
      description: "ส่งออกรายงานยอดขายและรายได้รอบ 6 เดือนล่าสุด",
      metadata: { rowCount: 6, format: "csv" },
    };

    const res = await request(app)
      .post("/executive/audit")
      .set("Authorization", `Bearer ${executiveToken}`)
      .send(payload);

    assert.equal(res.status, 201);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.data.action, "REPORT_EXPORT_CSV");
    assert.equal(res.body.data.actorId, actorId);
    assert.equal(res.body.data.category, "DATA_EXPORT");
  });

  await t.test(
    "queries executive audit logs via GET with pagination",
    async () => {
      const res = await request(app)
        .get(`/executive/audit?actorId=${actorId}`)
        .set("Authorization", `Bearer ${executiveToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].action, "REPORT_EXPORT_CSV");
      assert.equal(res.body.meta.total, 1);
    },
  );
});
