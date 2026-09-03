// Integration test against a real, disposable Postgres database — same
// skip/REQUIRE_INTEGRATION=1 convention as the other *.integration.test.js files.
//
// The REMOVE_PRODUCT decision dispatches an owner command over HTTP to
// product-service (ADM-DEC-001: no cross-service DB write) — this test stubs
// product-service with a real local Express server rather than mocking it out,
// so the actual request/response contract is exercised end to end.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}

const bcrypt = require("bcryptjs");
const prisma = require("../src/models/prismaClient");
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");

const TEST_EMAIL_PREFIX = "adm-003-integration-test+";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function tokenFor(userId, roles) {
  return signAccessToken({
    sub: userId,
    role: roles[0],
    roles,
    permissions: permissionsForRoles(roles),
  });
}

/** productModerationClient reads PRODUCT_SERVICE_URL at module-load time, so
 * this must start (and the env var be set) before the first `require("../src/app")`. */
function startMockProductService() {
  const moderationCalls = [];
  const mockApp = express();
  mockApp.use(express.json());
  mockApp.post("/internal/moderation/:id/remove", (req, res) => {
    moderationCalls.push({ productId: req.params.id, reason: req.body.reason });
    res.json({ id: req.params.id, status: "removed" });
  });

  return new Promise((resolve) => {
    const server = mockApp.listen(0, () => {
      resolve({ server, moderationCalls, port: server.address().port });
    });
  });
}

test("report lifecycle enforces review-before-action and dispatches owner commands", async (t) => {
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

  const {
    server: mockProductServer,
    moderationCalls,
    port,
  } = await startMockProductService();
  process.env.PRODUCT_SERVICE_URL = `http://localhost:${port}`;
  const app = require("../src/app");

  const adminId = `adm-003-admin+${Date.now()}`;
  let reporter;
  let target;

  try {
    reporter = await prisma.user.create({
      data: {
        email: `${TEST_EMAIL_PREFIX}reporter+${Date.now()}@example.test`,
        passwordHash: await bcrypt.hash("irrelevant", 10),
        firstName: "Reporter",
        lastName: "User",
        role: "BUYER",
      },
    });
    target = await prisma.user.create({
      data: {
        email: `${TEST_EMAIL_PREFIX}target+${Date.now()}@example.test`,
        passwordHash: await bcrypt.hash("irrelevant", 10),
        firstName: "Target",
        lastName: "User",
        role: "BUYER",
      },
    });

    const adminToken = tokenFor(adminId, ["ADMIN"]);
    const buyerToken = tokenFor(reporter.id, ["BUYER"]);

    const userReport = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetId: target.id,
        reason: "abusive messages",
      },
    });
    const productReport = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        productId: "product-int-test-1",
        reason: "counterfeit item",
      },
    });

    // Wrong role must be denied.
    const deniedRes = await request(app)
      .get("/admin/reports")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(deniedRes.status, 403);

    // Acting on a report before it's REVIEWED must conflict.
    const tooEarlyRes = await request(app)
      .post(`/admin/reports/${userReport.id}/action`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "SUSPEND_USER", reason: "confirmed abuse" });
    assert.equal(tooEarlyRes.status, 409);

    for (const report of [userReport, productReport]) {
      const reviewRes = await request(app)
        .post(`/admin/reports/${report.id}/review`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(reviewRes.status, 200);
      assert.equal(reviewRes.body.status, "REVIEWED");
    }

    // SUSPEND_USER action suspends the target immediately.
    const suspendActionRes = await request(app)
      .post(`/admin/reports/${userReport.id}/action`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "SUSPEND_USER", reason: "confirmed abuse" });
    assert.equal(suspendActionRes.status, 200);
    assert.equal(suspendActionRes.body.status, "ACTIONED");

    const suspendedUser = await prisma.user.findUnique({
      where: { id: target.id },
    });
    assert.equal(suspendedUser.status, "SUSPENDED");

    // Duplicate action on an already-decided report must conflict.
    const duplicateActionRes = await request(app)
      .post(`/admin/reports/${userReport.id}/action`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "DISMISS", reason: "changed my mind" });
    assert.equal(duplicateActionRes.status, 409);

    // Self-suspend must be denied.
    const selfSuspendRes = await request(app)
      .post(`/admin/users/${adminId}/suspend`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "test" });
    assert.equal(selfSuspendRes.status, 403);

    // Suspending an already-suspended user must conflict; restore then works.
    const duplicateSuspendRes = await request(app)
      .post(`/admin/users/${target.id}/suspend`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "already suspended" });
    assert.equal(duplicateSuspendRes.status, 409);

    const restoreRes = await request(app)
      .post(`/admin/users/${target.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "appeal accepted" });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.body.status, "ACTIVE");

    // REMOVE_PRODUCT dispatches the owner command to product-service instead
    // of writing product-service's database directly.
    const removeActionRes = await request(app)
      .post(`/admin/reports/${productReport.id}/action`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "REMOVE_PRODUCT", reason: "confirmed counterfeit" });
    assert.equal(removeActionRes.status, 200);
    assert.equal(moderationCalls.length, 1);
    assert.equal(moderationCalls[0].productId, "product-int-test-1");
    assert.equal(moderationCalls[0].reason, "confirmed counterfeit");

    // Safety summary reflects real report/audit counts; completedOrders is
    // explicitly unavailable (order-service is out of ADM-003 scope).
    const summaryRes = await request(app)
      .get(`/admin/users/${target.id}/safety-summary`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.completedOrders, null);
    assert.equal(summaryRes.body.completedOrdersAvailable, false);
    assert.equal(summaryRes.body.reportCount, 1);
    assert.ok(summaryRes.body.priorActions >= 2); // suspend + restore
  } finally {
    if (reporter) {
      await prisma.report.deleteMany({ where: { reporterId: reporter.id } });
    }
    await prisma.adminAudit.deleteMany({ where: { actorId: adminId } });
    if (reporter) await prisma.user.deleteMany({ where: { id: reporter.id } });
    if (target) await prisma.user.deleteMany({ where: { id: target.id } });
    await prisma.$disconnect();
    mockProductServer.close();
  }
});
