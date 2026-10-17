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
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

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

  await prisma.user.create({
    data: {
      id: actorId,
      email: `ceo-${runId}@reloop.test`,
      passwordHash: "integration-test-only",
      firstName: "Integration",
      lastName: "CEO",
      role: "EXECUTIVE",
    },
  });

  t.after(async () => {
    await prisma.executiveAuditLog.deleteMany({
      where: { actorId },
    });
    await prisma.user.deleteMany({ where: { id: actorId } });
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

  await t.test(
    "records an allowed action, with server-owned wording",
    async () => {
      const res = await request(app)
        .post("/executive/audit")
        .set("Authorization", `Bearer ${executiveToken}`)
        // Headers a client sets itself must not decide who is recorded.
        .set("x-user-id", "someone-else")
        .set("x-user-display-name", "Somebody Else")
        .send({
          action: "REPORT_EXPORT_CSV",
          category: "FINANCIAL",
          targetId: "2026-10",
          description: "ลบข้อมูลลูกค้าทั้งหมด",
          metadata: {
            granularity: "month",
            year: 2026,
            monthIndex: 9,
            rowCount: 31,
            injected: "ignored",
          },
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.status, "ok");
      const log = res.body.data;
      assert.equal(log.action, "REPORT_EXPORT_CSV");
      assert.equal(log.actorId, actorId);
      // The email is read from the users table, not the token's display name.
      assert.equal(log.actorEmail, `ceo-${runId}@reloop.test`);
      assert.equal(log.actorRole, "EXECUTIVE");
      assert.equal(log.category, "DATA_EXPORT");
      assert.equal(
        log.description,
        "ส่งออกรายงานยอดขายและรายได้ (เดือน ตุลาคม 2569)",
      );
      assert.deepEqual(log.metadata, {
        granularity: "month",
        year: 2026,
        monthIndex: 9,
        rowCount: 31,
      });
    },
  );

  await t.test(
    "rejects an unknown action and bad metadata with 400",
    async () => {
      for (const body of [
        { action: "DELETE_ALL_USERS", description: "x" },
        { action: "REPORT_EXPORT_CSV", metadata: { rowCount: "many" } },
        { action: "REPORT_EXPORT_CSV", targetId: "../../etc" },
      ]) {
        const res = await request(app)
          .post("/executive/audit")
          .set("Authorization", `Bearer ${executiveToken}`)
          .send(body);
        assert.equal(res.status, 400, JSON.stringify(body));
      }
    },
  );

  await t.test(
    "refuses to record for an account that does not exist",
    async () => {
      const ghost = signAccessToken({
        sub: `ghost-${runId}`,
        role: "EXECUTIVE",
        displayName: "Ghost",
      });
      const res = await request(app)
        .post("/executive/audit")
        .set("Authorization", `Bearer ${ghost}`)
        .send({ action: "REPORT_EXPORT_CSV" });
      assert.equal(res.status, 403);
    },
  );

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
