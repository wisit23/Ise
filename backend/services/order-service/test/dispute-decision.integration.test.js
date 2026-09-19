const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.DATABASE_URL_ORDER ||= "postgresql://reloop:reloop_dev_password@127.0.0.1:5432/reloop_order";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

const buyerId = `int-test-dispute-buyer-${Date.now()}`;
const sellerId = `int-test-dispute-seller-${Date.now()}`;
const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
const strangerToken = signAccessToken({
  sub: `int-test-dispute-stranger-${Date.now()}`,
  role: "BUYER",
});
const agentToken = signAccessToken({
  sub: "int-test-dispute-agent",
  role: "CUSTOMER_SERVICE",
});

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function makeCompletedOrder() {
  return prisma.order.create({
    data: {
      buyerId,
      sellerId,
      productId: `int-test-prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productTitle: "Test item",
      price: 1500,
      status: "completed",
    },
  });
}

test("dispute lifecycle: hold payout, one-way decision, RBAC", async (t) => {
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

  const order = await makeCompletedOrder();

  // Stranger cannot open a dispute on an order they are not the buyer of.
  const strangerOpenRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${strangerToken}`)
    .send({ reason: "not my order" });
  assert.equal(strangerOpenRes.status, 403);

  // Buyer opens the dispute.
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "ของพัง เปิดกล่องมาแตกละเอียด" });
  assert.equal(openRes.status, 201);
  assert.equal(openRes.body.status, "OPEN");
  assert.equal(openRes.body.orderId, order.id);
  assert.equal(openRes.body.openedBy, buyerId);
  const disputeId = openRes.body.id;

  // Order enters disputed status and its payout is marked held.
  const orderAfterOpen = await prisma.order.findUnique({
    where: { id: order.id },
  });
  assert.equal(orderAfterOpen.status, "disputed");
  assert.equal(orderAfterOpen.payoutHeld, true);
  assert.ok(orderAfterOpen.disputedAt);

  // Can't open a second dispute on the same order — status check catches it
  // first (order is "disputed", not "completed", once the first dispute
  // exists); disputeModel.openDispute's own P2002-on-unique-orderId handling
  // is a race-condition backstop for two opens landing concurrently, not
  // the path a sequential retry like this one takes.
  const duplicateOpenRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "อีกครั้ง" });
  assert.equal(duplicateOpenRes.status, 400);

  // Stranger cannot read the dispute.
  const strangerGetRes = await request(app)
    .get(`/disputes/${disputeId}`)
    .set("Authorization", `Bearer ${strangerToken}`);
  assert.equal(strangerGetRes.status, 403);

  // Buyer can read the dispute.
  const buyerGetRes = await request(app)
    .get(`/disputes/${disputeId}`)
    .set("Authorization", `Bearer ${buyerToken}`);
  assert.equal(buyerGetRes.status, 200);

  // A buyer (not an agent) cannot decide.
  const buyerDecideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ decision: "APPROVE_REFUND", reason: "should not work" });
  assert.equal(buyerDecideRes.status, 403);

  // Agent claims the dispute first (TSR-02 Requirement 1)
  const claimRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ version: 0 });
  assert.equal(claimRes.status, 200);
  assert.equal(claimRes.body.version, 1);

  // Decision requires a reason.
  const noReasonRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ decision: "APPROVE_REFUND", version: 1 });
  assert.equal(noReasonRes.status, 400);

  // First decision succeeds.
  const decideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({
      decision: "APPROVE_REFUND",
      reason: "หลักฐานชัดเจน สินค้าชำรุดจริง",
      version: 1,
    });
  assert.equal(decideRes.status, 200);
  assert.equal(decideRes.body.decision, "APPROVE_REFUND");
  assert.equal(decideRes.body.status, "DECIDED");

  // Order reflects the refund and payout is released from hold.
  const orderAfterDecision = await prisma.order.findUnique({
    where: { id: order.id },
  });
  assert.equal(orderAfterDecision.status, "refunded");
  assert.equal(orderAfterDecision.payoutHeld, false);

  // A second decision on the same dispute is rejected — exactly-one guarantee.
  const secondDecisionRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ decision: "REJECT", reason: "เปลี่ยนใจ", version: 2 });
  assert.equal(secondDecisionRes.status, 409);

  // Audit trail recorded open, claim, and decide.
  const auditRows = await prisma.disputeAuditLog.findMany({
    where: { disputeId },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(
    auditRows.map((r) => r.action),
    ["OPEN", "CLAIM", "DECIDE"],
  );
});

test("REJECT decision unholds payout and returns the order to completed", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("covered by the previous test's database-availability check");
    return;
  }

  const order = await makeCompletedOrder();
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "ของไม่ตรงปก" });
  const disputeId = openRes.body.id;

  // Agent claims dispute first
  const claimRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ version: 0 });
  assert.equal(claimRes.status, 200);

  const decideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ decision: "REJECT", reason: "หลักฐานไม่เพียงพอ", version: 1 });
  assert.equal(decideRes.status, 200);

  const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderAfter.status, "completed");
  assert.equal(orderAfter.payoutHeld, false);
});
