// Integration test against a real, disposable Postgres database (reloop_order).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
//
// Evidence normally comes from a CS case / Chat projection (plan.md
// "Consumes"), but that feature doesn't exist in the codebase yet — this
// test seeds DisputeEvidence directly via Prisma instead of inventing a
// CS-facing submit endpoint Admin doesn't own the contract for (ADM-DEC-010's
// pattern, applied here too).
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
}

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");

const TEST_TITLE_PREFIX = "adm-004-integration-test ";

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

test("dispute hold/release enforce permission, version and single-hold rules", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/order-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const order = await prisma.order.create({
    data: {
      buyerId: "int-test-buyer",
      sellerId: "int-test-seller",
      productId: "int-test-product",
      productTitle: `${TEST_TITLE_PREFIX}disputed item`,
      price: 1200,
      status: "shipped",
    },
  });
  await prisma.disputeEvidence.create({
    data: {
      orderId: order.id,
      evidenceRef: "https://example.test/cs-case/1",
      note: "buyer claims item never arrived",
      submittedBy: "cs-agent-1",
    },
  });

  const adminToken = tokenFor("admin-1", ["ADMIN"]);
  const sellerToken = tokenFor(order.sellerId, ["SELLER"]);

  try {
    // Wrong role must be denied before touching state.
    const deniedRes = await request(app)
      .post(`/admin/${order.id}/hold`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ reason: "investigating", version: order.version });
    assert.equal(deniedRes.status, 403);

    // Viewing evidence must record an access audit entry.
    const viewRes = await request(app)
      .get(`/admin/${order.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(viewRes.status, 200);
    assert.equal(viewRes.body.evidence.length, 1);
    assert.equal(
      viewRes.body.evidence[0].evidenceRef,
      "https://example.test/cs-case/1",
    );
    const viewAudits = await prisma.disputeAudit.findMany({
      where: { orderId: order.id, action: "EVIDENCE_VIEWED" },
    });
    assert.equal(viewAudits.length, 1);

    // Stale version must be rejected as a conflict, not silently applied.
    const staleRes = await request(app)
      .post(`/admin/${order.id}/hold`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "investigating", version: order.version + 1 });
    assert.equal(staleRes.status, 409);

    // Correct version holds the funds and branches the order into "disputed".
    const holdRes = await request(app)
      .post(`/admin/${order.id}/hold`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "investigating", version: order.version });
    assert.equal(holdRes.status, 200);
    assert.equal(holdRes.body.paymentSimulationStatus, "ON_HOLD");
    assert.equal(holdRes.body.status, "disputed");
    assert.equal(holdRes.body.preDisputeStatus, "shipped");

    // Duplicate hold on an already-held order must conflict (this doubles as
    // the "CS decision conflict" case — a second actor cannot silently
    // override an in-flight hold).
    const duplicateHoldRes = await request(app)
      .post(`/admin/${order.id}/hold`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "investigating again", version: holdRes.body.version });
    assert.equal(duplicateHoldRes.status, 409);

    // Releasing with a stale version must also conflict...
    const staleReleaseRes = await request(app)
      .post(`/admin/${order.id}/release`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "resolved", version: order.version });
    assert.equal(staleReleaseRes.status, 409);

    // ...and recovering with the fresh version succeeds, restoring the
    // pre-dispute order status.
    const releaseRes = await request(app)
      .post(`/admin/${order.id}/release`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "resolved", version: holdRes.body.version });
    assert.equal(releaseRes.status, 200);
    assert.equal(releaseRes.body.paymentSimulationStatus, "RELEASE_PENDING");
    assert.equal(releaseRes.body.status, "shipped");
    assert.equal(releaseRes.body.preDisputeStatus, null);

    const holdAudits = await prisma.disputeAudit.findMany({
      where: { orderId: order.id, action: { in: ["HOLD", "RELEASE"] } },
    });
    assert.equal(holdAudits.length, 2);
  } finally {
    await prisma.disputeAudit.deleteMany({ where: { orderId: order.id } });
    await prisma.disputeEvidence.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.$disconnect();
  }
});
