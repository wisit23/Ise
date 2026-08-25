const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const buyerId = `int-test-dispute-buyer-${Date.now()}`;
const sellerId = `int-test-dispute-seller-${Date.now()}`;
const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
const strangerToken = signAccessToken({
  sub: `int-test-dispute-stranger-${Date.now()}`,
  role: "BUYER",
});
const agentToken = signAccessToken({ sub: "int-test-dispute-agent", role: "CUSTOMER_SERVICE" });

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
      productId: `int-test-dispute-product-${Date.now()}`,
      productTitle: "dispute test product",
      price: 1000,
      status: "completed",
    },
  });
}

test("dispute lifecycle: hold payout, one-way decision, RBAC", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_ORDER not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/order-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const order = await makeCompletedOrder();

  // A stranger cannot open a dispute on someone else's order.
  const strangerOpenRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${strangerToken}`)
    .send({ reason: "not mine" });
  assert.equal(strangerOpenRes.status, 403);

  // Buyer opens the dispute.
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "สินค้าชำรุด ไม่ตรงตามที่ตกลง" });
  assert.equal(openRes.status, 201);
  const disputeId = openRes.body.id;

  // Order flips to disputed + payout held (WF-08 step 3), atomically.
  const orderAfterOpen = await prisma.order.findUnique({ where: { id: order.id } });
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

  // A stranger cannot view the dispute either.
  const strangerViewRes = await request(app)
    .get(`/disputes/${disputeId}`)
    .set("Authorization", `Bearer ${strangerToken}`);
  assert.equal(strangerViewRes.status, 403);

  // A buyer (not an agent) cannot decide.
  const buyerDecideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ decision: "APPROVE_REFUND", reason: "should not work" });
  assert.equal(buyerDecideRes.status, 403);

  // Reason is required (FR-3.2.2).
  const noReasonRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ decision: "APPROVE_REFUND" });
  assert.equal(noReasonRes.status, 400);

  // First decision succeeds.
  const decideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ decision: "APPROVE_REFUND", reason: "หลักฐานชัดเจน สินค้าชำรุดจริง" });
  assert.equal(decideRes.status, 200);
  assert.equal(decideRes.body.decision, "APPROVE_REFUND");
  assert.equal(decideRes.body.status, "DECIDED");

  // Order reflects the refund and payout is released from hold.
  const orderAfterDecision = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderAfterDecision.status, "refunded");
  assert.equal(orderAfterDecision.payoutHeld, false);

  // A second decision on the same dispute is rejected — exactly-one guarantee.
  const secondDecisionRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ decision: "REJECT", reason: "เปลี่ยนใจ" });
  assert.equal(secondDecisionRes.status, 409);

  // Audit trail recorded both the open and the decide.
  const auditRows = await prisma.disputeAuditLog.findMany({
    where: { disputeId },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(
    auditRows.map((r) => r.action),
    ["OPEN", "DECIDE"],
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

  const decideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ decision: "REJECT", reason: "หลักฐานไม่เพียงพอ" });
  assert.equal(decideRes.status, 200);

  const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderAfter.status, "completed");
  assert.equal(orderAfter.payoutHeld, false);
});
