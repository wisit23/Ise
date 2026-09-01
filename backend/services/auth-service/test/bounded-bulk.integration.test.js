// Integration test against a real, disposable Postgres database — same
// skip/REQUIRE_INTEGRATION=1 convention as the other *.integration.test.js files.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}

const bcrypt = require("bcryptjs");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");

const TEST_EMAIL_PREFIX = "adm-005-integration-test+";

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

test("bounded batch enforces cap, dry-run, permission-per-action and idempotency", async (t) => {
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

  const adminId = `adm-005-admin+${Date.now()}`;
  const adminToken = tokenFor(adminId, ["ADMIN"]);
  const marketingToken = tokenFor(`adm-005-marketing+${Date.now()}`, [
    "MARKETING",
  ]);
  let userA;
  let userB;

  try {
    userA = await prisma.user.create({
      data: {
        email: `${TEST_EMAIL_PREFIX}a+${Date.now()}@example.test`,
        passwordHash: await bcrypt.hash("irrelevant", 10),
        firstName: "A",
        lastName: "User",
        role: "BUYER",
      },
    });
    userB = await prisma.user.create({
      data: {
        email: `${TEST_EMAIL_PREFIX}b+${Date.now()}@example.test`,
        passwordHash: await bcrypt.hash("irrelevant", 10),
        firstName: "B",
        lastName: "User",
        role: "BUYER",
      },
    });

    // Cap: a batch over 100 ids must be rejected before running anything.
    const overCapRes = await request(app)
      .post("/admin/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "SUSPEND_USER",
        ids: Array.from({ length: 101 }, (_, i) => `id-${i}`),
        reason: "test",
      });
    assert.equal(overCapRes.status, 400);

    // Unsupported action must be rejected (proves the registry, not a
    // hardcoded branch, decides what's runnable).
    const unsupportedRes = await request(app)
      .post("/admin/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "AUCTION_DECISION", ids: [userA.id], reason: "test" });
    assert.equal(unsupportedRes.status, 400);

    // Wrong permission for this specific action must be denied even though
    // the caller is authenticated.
    const deniedRes = await request(app)
      .post("/admin/bulk")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({ action: "SUSPEND_USER", ids: [userA.id], reason: "test" });
    assert.equal(deniedRes.status, 403);

    // Dry run previews the outcome without suspending anyone.
    const dryRunRes = await request(app)
      .post("/admin/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "SUSPEND_USER",
        ids: [userA.id, "not-a-real-user-id"],
        reason: "investigating",
        dryRun: true,
      });
    assert.equal(dryRunRes.status, 200);
    assert.equal(dryRunRes.body.dryRun, true);
    assert.equal(dryRunRes.body.succeeded, 1);
    assert.equal(dryRunRes.body.failed, 1);
    const stillActive = await prisma.user.findUnique({
      where: { id: userA.id },
    });
    assert.equal(stillActive.status, "ACTIVE");

    // Real run: partial failure — one real id succeeds, one bogus id fails,
    // and the batch does not abort because of the bogus one.
    const runRes = await request(app)
      .post("/admin/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "SUSPEND_USER",
        ids: [userA.id, "not-a-real-user-id"],
        reason: "investigating",
        idempotencyKey: `bulk-test-${userA.id}`,
      });
    assert.equal(runRes.status, 200);
    assert.equal(runRes.body.succeeded, 1);
    assert.equal(runRes.body.failed, 1);

    const suspendedA = await prisma.user.findUnique({
      where: { id: userA.id },
    });
    assert.equal(suspendedA.status, "SUSPENDED");

    // Replaying the same idempotencyKey must not run the batch again — userB
    // was never in that batch, so if this replayed instead of no-op'ing on
    // the stored result we'd see no change either way; the real signal is
    // that the stored summary comes back unchanged and userA isn't
    // re-processed (already SUSPENDED, so a second real run would just
    // report "already suspended" as a failure instead of the original success).
    const replayRes = await request(app)
      .post("/admin/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "SUSPEND_USER",
        ids: [userA.id, "not-a-real-user-id"],
        reason: "investigating",
        idempotencyKey: `bulk-test-${userA.id}`,
      });
    assert.equal(replayRes.status, 200);
    assert.deepEqual(replayRes.body, runRes.body);

    // Audit query: wrong permission denied, correct permission returns rows.
    const auditDeniedRes = await request(app)
      .get("/admin/audit")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(auditDeniedRes.status, 403);

    const auditRes = await request(app)
      .get(`/admin/audit?targetId=${userA.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.body.items.some((a) => a.action === "USER_SUSPENDED"));
  } finally {
    await prisma.bulkActionRun.deleteMany({
      where: { idempotencyKey: `bulk-test-${userA?.id}` },
    });
    await prisma.adminAudit.deleteMany({ where: { actorId: adminId } });
    if (userA) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB) await prisma.user.deleteMany({ where: { id: userB.id } });
    await prisma.$disconnect();
  }
});
