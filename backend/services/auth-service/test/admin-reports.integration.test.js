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
  const completedCommands = new Map();
  const mockApp = express();
  mockApp.use(express.json());
  mockApp.post("/internal/moderation/:id/remove", (req, res) => {
    const idempotencyKey = req.get("x-idempotency-key");
    const completed = completedCommands.get(idempotencyKey);
    if (completed) {
      if (
        completed.action !== "REMOVE_PRODUCT" ||
        completed.productId !== req.params.id ||
        completed.reason !== req.body.reason
      ) {
        res.status(409).json({ error: "idempotency key payload mismatch" });
        return;
      }
      res.json(completed.result);
      return;
    }
    const result = { id: req.params.id, status: "removed" };
    completedCommands.set(idempotencyKey, {
      action: "REMOVE_PRODUCT",
      productId: req.params.id,
      reason: req.body.reason,
      result,
    });
    moderationCalls.push({
      action: "REMOVE_PRODUCT",
      productId: req.params.id,
      reason: req.body.reason,
      idempotencyKey,
    });
    if (req.params.id === "product-timeout-int-test") {
      setTimeout(() => res.json(result), 75);
      return;
    }
    res.json(result);
  });
  mockApp.post("/internal/moderation/:id/restore", (req, res) => {
    const idempotencyKey = req.get("x-idempotency-key");
    const completed = completedCommands.get(idempotencyKey);
    if (completed) {
      if (
        completed.action !== "RESTORE_PRODUCT" ||
        completed.productId !== req.params.id ||
        completed.reason !== req.body.reason
      ) {
        res.status(409).json({ error: "idempotency key payload mismatch" });
        return;
      }
      res.json(completed.result);
      return;
    }
    const result = { id: req.params.id, status: "available" };
    completedCommands.set(idempotencyKey, {
      action: "RESTORE_PRODUCT",
      productId: req.params.id,
      reason: req.body.reason,
      result,
    });
    moderationCalls.push({
      action: "RESTORE_PRODUCT",
      productId: req.params.id,
      reason: req.body.reason,
      idempotencyKey,
    });
    res.json(result);
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
  // This feature suite uses signed identity fixtures; live session enforcement
  // is covered separately by account-suspension.integration.test.js.
  app.locals.validateAccessSession = async () => {};

  const adminId = `adm-003-admin+${Date.now()}`;
  let admin;
  let reporter;
  let target;

  try {
    admin = await prisma.user.create({
      data: {
        id: adminId,
        email: `${TEST_EMAIL_PREFIX}admin+${Date.now()}@example.test`,
        passwordHash: await bcrypt.hash("irrelevant", 10),
        firstName: "Admin",
        lastName: "User",
        role: "ADMIN",
      },
    });
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
    const concurrentReport = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetId: target.id,
        reason: "concurrent report action",
      },
    });
    const timeoutReport = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        productId: "product-timeout-int-test",
        reason: "timeout retry test",
      },
    });
    const inboxPrefix = `tsr05-${Date.now()}`;
    await prisma.report.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        reporterId: reporter.id,
        targetId: target.id,
        reason: `${inboxPrefix}-page-${index + 1}`,
      })),
    });

    const thirdPageRes = await request(app)
      .get(`/admin/reports?page=3&limit=2&q=${inboxPrefix}&status=OPEN`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(thirdPageRes.status, 200);
    assert.equal(thirdPageRes.body.page, 3);
    assert.equal(thirdPageRes.body.total, 5);
    assert.equal(thirdPageRes.body.totalPages, 3);
    assert.equal(thirdPageRes.body.items.length, 1);

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

    for (const report of [
      userReport,
      productReport,
      concurrentReport,
      timeoutReport,
    ]) {
      const reviewRes = await request(app)
        .post(`/admin/reports/${report.id}/review`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(reviewRes.status, 200);
      assert.equal(reviewRes.body.status, "REVIEWED");
    }

    const concurrentActions = await Promise.all([
      request(app)
        .post(`/admin/reports/${concurrentReport.id}/action`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ decision: "DISMISS", reason: "no violation" }),
      request(app)
        .post(`/admin/reports/${concurrentReport.id}/action`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ decision: "DISMISS", reason: "no violation" }),
    ]);
    assert.deepEqual(
      concurrentActions.map((res) => res.status).sort(),
      [200, 409],
    );
    assert.equal(
      await prisma.adminAudit.count({
        where: {
          targetId: concurrentReport.id,
          action: "REPORT_DISMISS",
        },
      }),
      1,
    );

    const decidedDetailRes = await request(app)
      .get(`/admin/reports/${concurrentReport.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(decidedDetailRes.status, 200);
    assert.equal(decidedDetailRes.body.reporter.id, reporter.id);
    assert.equal(decidedDetailRes.body.target.id, target.id);
    assert.equal(decidedDetailRes.body.decision.action, "DISMISS");
    assert.equal(decidedDetailRes.body.decision.reason, "no violation");
    assert.equal(decidedDetailRes.body.decision.decidedBy.id, adminId);
    assert.ok(decidedDetailRes.body.decision.decidedAt);

    const directProductId = "product-direct-int-test-1";
    const directRemoveKey = `direct-remove-${Date.now()}`;
    const directRemoveRes = await request(app)
      .post(`/admin/products/${directProductId}/remove`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "direct counterfeit review",
        idempotencyKey: directRemoveKey,
      });
    assert.equal(directRemoveRes.status, 200);

    const directReplayRes = await request(app)
      .post(`/admin/products/${directProductId}/remove`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "direct counterfeit review",
        idempotencyKey: directRemoveKey,
      });
    assert.equal(directReplayRes.status, 200);

    const directMismatchRes = await request(app)
      .post(`/admin/products/${directProductId}/remove`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "different reason",
        idempotencyKey: directRemoveKey,
      });
    assert.equal(directMismatchRes.status, 409);

    const directRestoreRes = await request(app)
      .post(`/admin/products/${directProductId}/restore`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "manual review cleared the product",
        idempotencyKey: `direct-restore-${Date.now()}`,
      });
    assert.equal(directRestoreRes.status, 200);
    assert.equal(
      moderationCalls.filter((call) => call.productId === directProductId)
        .length,
      2,
    );

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
    assert.equal(
      moderationCalls.filter((call) => call.productId === "product-int-test-1")
        .length,
      1,
    );
    const reportModerationCall = moderationCalls.find(
      (call) => call.productId === "product-int-test-1",
    );
    assert.equal(reportModerationCall.reason, "confirmed counterfeit");
    assert.equal(
      reportModerationCall.idempotencyKey,
      `report:${productReport.id}:REMOVE_PRODUCT`,
    );

    // A client retry after losing the first response returns the persisted
    // report and does not dispatch a second product command or duplicate audit.
    const replayRemoveRes = await request(app)
      .post(`/admin/reports/${productReport.id}/action`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "REMOVE_PRODUCT", reason: "confirmed counterfeit" });
    assert.equal(replayRemoveRes.status, 200);
    assert.equal(
      moderationCalls.filter((call) => call.productId === "product-int-test-1")
        .length,
      1,
    );
    assert.equal(
      await prisma.adminAudit.count({
        where: {
          targetId: productReport.id,
          action: "REPORT_REMOVE_PRODUCT",
        },
      }),
      1,
    );

    // The owner can complete its command while Auth loses the response. A
    // retry reuses the same durable operation/key, so the owner returns the
    // stored result and the report is finalized without a second side effect.
    process.env.PRODUCT_MODERATION_TIMEOUT_MS = "10";
    const timedOutRemoveRes = await request(app)
      .post(`/admin/reports/${timeoutReport.id}/action`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "REMOVE_PRODUCT", reason: "confirmed timeout case" });
    assert.equal(timedOutRemoveRes.status, 502);
    assert.equal(
      (await prisma.report.findUnique({ where: { id: timeoutReport.id } }))
        .status,
      "REVIEWED",
    );

    process.env.PRODUCT_MODERATION_TIMEOUT_MS = "5000";
    const timeoutRetryRes = await request(app)
      .post(`/admin/reports/${timeoutReport.id}/action`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "REMOVE_PRODUCT", reason: "confirmed timeout case" });
    assert.equal(timeoutRetryRes.status, 200);
    assert.equal(timeoutRetryRes.body.status, "ACTIONED");
    assert.equal(
      moderationCalls.filter(
        (call) => call.productId === "product-timeout-int-test",
      ).length,
      1,
    );
    assert.equal(
      await prisma.adminAudit.count({
        where: {
          targetId: timeoutReport.id,
          action: "REPORT_REMOVE_PRODUCT",
        },
      }),
      1,
    );

    // Safety summary reflects real report/audit counts; completedOrders is
    // explicitly unavailable (order-service is out of ADM-003 scope).
    const summaryRes = await request(app)
      .get(`/admin/users/${target.id}/safety-summary`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.completedOrders, null);
    assert.equal(summaryRes.body.completedOrdersAvailable, false);
    assert.equal(summaryRes.body.reportCount, 2);
    assert.ok(summaryRes.body.priorActions >= 2); // suspend + restore

    // ADM-DEC-022: User detail lookup with safety summary
    const userDetailRes = await request(app)
      .get(`/admin/users/${target.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(userDetailRes.status, 200);
    assert.equal(userDetailRes.body.id, target.id);
    assert.equal(userDetailRes.body.email, target.email);
    assert.ok(userDetailRes.body.safetySummary);
    assert.equal(userDetailRes.body.safetySummary.reportCount, 2);

    const reportHistoryRes = await request(app)
      .get(`/admin/users/${target.id}/history`)
      .query({ kind: "reports", page: 1, limit: 1 })
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(reportHistoryRes.status, 200);
    assert.equal(reportHistoryRes.body.total, 2);
    assert.equal(reportHistoryRes.body.items.length, 1);
    assert.equal(reportHistoryRes.body.totalPages, 2);

    const actionHistoryRes = await request(app)
      .get(`/admin/users/${target.id}/history`)
      .query({ kind: "actions", page: 1, limit: 10 })
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(actionHistoryRes.status, 200);
    assert.ok(
      actionHistoryRes.body.items.some(
        (item) => item.action === "USER_SUSPENDED",
      ),
    );
    assert.ok(
      actionHistoryRes.body.items.some(
        (item) => item.action === "USER_RESTORED",
      ),
    );
  } finally {
    delete process.env.PRODUCT_MODERATION_TIMEOUT_MS;
    if (reporter) {
      await prisma.report.deleteMany({ where: { reporterId: reporter.id } });
    }
    await prisma.adminAudit.deleteMany({ where: { actorId: adminId } });
    if (admin) await prisma.user.deleteMany({ where: { id: admin.id } });
    if (reporter) await prisma.user.deleteMany({ where: { id: reporter.id } });
    if (target) await prisma.user.deleteMany({ where: { id: target.id } });
    await prisma.$disconnect();
    mockProductServer.close();
  }
});
