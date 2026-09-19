const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.DATABASE_URL_ORDER ||=
  "postgresql://reloop:reloop_dev_password@127.0.0.1:5432/reloop_order";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
}

const { signAccessToken, permissionsForRoles } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const authClient = require("../src/services/authClient");
const productClient = require("../src/services/productClient");
productClient.setProductStatus = async () => ({ ok: true });
productClient.completeProductReservation = async () => ({ ok: true });
app.locals.validateAccessSession = async () => {};

function tokenFor(userId, roles) {
  return signAccessToken({
    sub: userId,
    role: roles[0],
    roles,
    permissions: permissionsForRoles(roles),
  });
}

const buyerId = `tsr02-buyer-${Date.now()}`;
const sellerId = `tsr02-seller-${Date.now()}`;
const buyerToken = tokenFor(buyerId, ["BUYER"]);
const sellerToken = tokenFor(sellerId, ["SELLER"]);

const agent1Id = "tsr02-agent-1";
const agent2Id = "tsr02-agent-2";
const tsAgentId = "tsr02-ts-agent";
const tsAgent2Id = "tsr02-ts-agent-2";

const agent1Token = tokenFor(agent1Id, ["CUSTOMER_SERVICE"]);
const agent2Token = tokenFor(agent2Id, ["CUSTOMER_SERVICE"]);
const tsAgentToken = tokenFor(tsAgentId, ["TRUST_AND_SAFETY"]);
const tsAgent2Token = tokenFor(tsAgent2Id, ["TRUST_AND_SAFETY"]);
const secondaryAgentToken = tokenFor("tsr02-secondary-agent", [
  "BUYER",
  "CUSTOMER_SERVICE",
]);

// Mock authClient for target user resolution
authClient.setMockUserResolver(async (id) => {
  if (id === agent1Id || id === agent2Id) {
    return {
      id,
      status: "ACTIVE",
      roles: ["CUSTOMER_SERVICE"],
      role: "CUSTOMER_SERVICE",
    };
  }
  if (id === tsAgentId || id === tsAgent2Id) {
    return {
      id,
      status: "ACTIVE",
      roles: ["TRUST_AND_SAFETY"],
      role: "TRUST_AND_SAFETY",
    };
  }
  if (id === "suspended-agent") {
    return {
      id,
      status: "SUSPENDED",
      roles: ["CUSTOMER_SERVICE"],
      role: "CUSTOMER_SERVICE",
    };
  }
  if (id === buyerId) {
    return { id, status: "ACTIVE", roles: ["BUYER"], role: "BUYER" };
  }
  return null;
});

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) {
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error("REQUIRE_INTEGRATION=1 but DATABASE_URL is not set");
    }
    return false;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(
        "REQUIRE_INTEGRATION=1 but DATABASE_URL is not reachable",
        { cause: error },
      );
    }
    return false;
  }
}

async function makeOrder(status = "completed", overrides = {}) {
  return prisma.order.create({
    data: {
      buyerId,
      sellerId,
      productId: `tsr02-prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productTitle: "TSR-02 test product",
      price: 1500,
      status,
      version: 0,
      paymentSimulationStatus: "RELEASE_PENDING",
      ...overrides,
    },
  });
}

test("TSR-02: Single-owner dispute assignment, unassigned read-only, validation, reassign & escalate", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  const order = await makeOrder("completed");

  const multiRoleQueue = await request(app)
    .get("/disputes/queue")
    .set("Authorization", `Bearer ${secondaryAgentToken}`);
  assert.equal(multiRoleQueue.status, 200);

  // 1. Buyer opens dispute
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "ตำหนิหนัก ไม่ตรงปก" });
  assert.equal(openRes.status, 201);
  const disputeId = openRes.body.id;
  assert.equal(openRes.body.assignedTo, null);
  assert.equal(openRes.body.version, 0);

  // 2. Unassigned dispute is READ-ONLY for agents: deciding without claiming -> 403
  const unassignedDecideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ decision: "REJECT", reason: "ตัดสินก่อนเคลม", version: 0 });
  assert.equal(unassignedDecideRes.status, 403);
  assert.ok(unassignedDecideRes.body.error?.includes("claimed"));

  // 3. Unassigned dispute: adding agent evidence without claiming -> 403
  const unassignedEvidenceRes = await request(app)
    .post(`/disputes/${disputeId}/evidence`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .attach("file", Buffer.from("fake evidence"), "evidence.jpg");
  assert.equal(unassignedEvidenceRes.status, 403);
  assert.ok(unassignedEvidenceRes.body.error?.includes("claimed"));

  // 4. Missing/non-numeric version on claim is rejected with 400
  const noVersionClaimRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({});
  assert.equal(noVersionClaimRes.status, 400);

  // 5. Agent 1 claims the dispute with version 0
  const claimRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ version: 0 });
  assert.equal(claimRes.status, 200);
  assert.equal(claimRes.body.assignedTo, agent1Id);
  assert.equal(claimRes.body.assignedRole, "CUSTOMER_SERVICE");
  assert.equal(claimRes.body.version, 1);

  // 6. Agent 2 tries to claim concurrently with stale version 0 -> 409 Conflict
  const conflictClaimRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agent2Token}`)
    .send({ version: 0 });
  assert.equal(conflictClaimRes.status, 409);

  // 7. Non-assigned Agent 2 tries to decide -> 403 Forbidden
  const forbiddenDecideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agent2Token}`)
    .send({ decision: "REJECT", reason: "ฉันไม่ใช่ผู้รับผิดชอบ", version: 1 });
  assert.equal(forbiddenDecideRes.status, 403);

  // 8. Non-assigned Agent 2 tries to add evidence -> 403 Forbidden
  const forbiddenEvidenceRes = await request(app)
    .post(`/disputes/${disputeId}/evidence`)
    .set("Authorization", `Bearer ${agent2Token}`)
    .attach("file", Buffer.from("fake evidence"), "evidence.jpg");
  assert.equal(forbiddenEvidenceRes.status, 403);

  // 9. Reassign target validations:
  // 9a. Target user does not exist -> 400
  const notFoundTargetRes = await request(app)
    .post(`/disputes/${disputeId}/reassign`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ toUserId: "non-existent-agent", reason: "โอนให้ผี", version: 1 });
  assert.equal(notFoundTargetRes.status, 400);

  // 9b. Target user is suspended -> 400
  const suspendedTargetRes = await request(app)
    .post(`/disputes/${disputeId}/reassign`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({
      toUserId: "suspended-agent",
      reason: "โอนให้คนโดนระงับ",
      version: 1,
    });
  assert.equal(suspendedTargetRes.status, 400);

  // 9c. Target user is not staff (buyer) -> 400
  const nonStaffTargetRes = await request(app)
    .post(`/disputes/${disputeId}/reassign`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ toUserId: buyerId, reason: "โอนให้ผู้ซื้อ", version: 1 });
  assert.equal(nonStaffTargetRes.status, 400);

  // 10. Agent 1 validly reassigns to Agent 2
  const reassignRes = await request(app)
    .post(`/disputes/${disputeId}/reassign`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({
      toUserId: agent2Id,
      reason: "ขอโอนเคสให้เจ้าหน้าที่ผลัดต่อไป",
      version: 1,
    });
  assert.equal(reassignRes.status, 200);
  assert.equal(reassignRes.body.assignedTo, agent2Id);
  assert.equal(reassignRes.body.version, 2);

  // 11. Agent 1 can no longer decide (ownership shifted to Agent 2) -> 403
  const agent1DecideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ decision: "REJECT", reason: "ตัดสินหลังโอนเคสแล้ว", version: 2 });
  assert.equal(agent1DecideRes.status, 403);

  // 12. Agent 2 escalates to Trust & Safety
  const escalateRes = await request(app)
    .post(`/disputes/${disputeId}/escalate`)
    .set("Authorization", `Bearer ${agent2Token}`)
    .send({
      reason: "พบพฤติกรรมฉ้อโกง ต้องให้ทีม Trust & Safety ตรวจสอบ",
      version: 2,
    });
  assert.equal(escalateRes.status, 200);
  assert.equal(escalateRes.body.assignedRole, "TRUST_AND_SAFETY");
  assert.equal(escalateRes.body.assignedTo, null);
  assert.equal(escalateRes.body.version, 3);

  // 13. CS agents cannot claim or decide an escalated dispute
  const csClaimEscalatedRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ version: 3 });
  assert.equal(csClaimEscalatedRes.status, 403);

  const csDecideEscalatedRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ decision: "REJECT", reason: "CS attempt", version: 3 });
  assert.equal(csDecideEscalatedRes.status, 403);

  // 14. T&S Agent CANNOT decide before claiming the escalated dispute -> 403
  const tsDecideBeforeClaimRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${tsAgentToken}`)
    .send({
      decision: "APPROVE_REFUND",
      reason: "ตัดสินก่อนเคลมเคส escalated",
      version: 3,
    });
  assert.equal(tsDecideBeforeClaimRes.status, 403);
  assert.ok(tsDecideBeforeClaimRes.body.error?.includes("claimed"));

  // 15. T&S Agent CLAIMS the escalated dispute
  const tsClaimRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${tsAgentToken}`)
    .send({ version: 3 });
  assert.equal(tsClaimRes.status, 200);
  assert.equal(tsClaimRes.body.assignedTo, tsAgentId);
  assert.equal(tsClaimRes.body.assignedRole, "TRUST_AND_SAFETY");
  assert.equal(tsClaimRes.body.version, 4);

  // 16. T&S Agent can now decide the claimed dispute
  const tsDecideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${tsAgentToken}`)
    .send({
      decision: "APPROVE_REFUND",
      reason: "ตรวจสอบแล้วเข้าข่ายฉ้อโกง อนุมัติคืนเงิน",
      version: 4,
    });
  assert.equal(tsDecideRes.status, 200);
  assert.equal(tsDecideRes.body.status, "DECIDED");
  assert.equal(tsDecideRes.body.decision, "APPROVE_REFUND");

  // Verify Audit Trail contains CLAIM, REASSIGN, ESCALATE, CLAIM, DECIDE
  const auditLogs = await prisma.disputeAuditLog.findMany({
    where: { disputeId },
    orderBy: { createdAt: "asc" },
  });
  const actions = auditLogs.map((l) => l.action);
  assert.ok(actions.includes("OPEN"));
  assert.ok(actions.includes("CLAIM"));
  assert.ok(actions.includes("REASSIGN"));
  assert.ok(actions.includes("ESCALATE"));
  assert.ok(actions.includes("DECIDE"));
});

test("TSR-02 Concurrency: 2 agents concurrent Claim race on same dispute", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  const order = await makeOrder("completed");
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "แข่งกันเคลม" });
  assert.equal(openRes.status, 201);
  const disputeId = openRes.body.id;

  // Race 2 agents claiming simultaneously with version 0
  const [res1, res2] = await Promise.all([
    request(app)
      .post(`/disputes/${disputeId}/claim`)
      .set("Authorization", `Bearer ${agent1Token}`)
      .send({ version: 0 }),
    request(app)
      .post(`/disputes/${disputeId}/claim`)
      .set("Authorization", `Bearer ${agent2Token}`)
      .send({ version: 0 }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(
    statuses,
    [200, 409],
    "Exactly one claim succeeds (200) and one conflicts (409)",
  );

  const disputeInDb = await prisma.disputeCase.findUnique({
    where: { id: disputeId },
  });
  assert.equal(disputeInDb.version, 1);
  assert.ok([agent1Id, agent2Id].includes(disputeInDb.assignedTo));
});

test("TSR-02 Concurrency: 2 admins concurrent Hold race on same order", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  const order = await makeOrder("completed");

  // Race 2 T&S agents placing hold simultaneously with version 0
  const [res1, res2] = await Promise.all([
    request(app)
      .post(`/admin/${order.id}/hold`)
      .set("Authorization", `Bearer ${tsAgentToken}`)
      .send({ reason: "Admin 1 hold", version: 0 }),
    request(app)
      .post(`/admin/${order.id}/hold`)
      .set("Authorization", `Bearer ${tsAgent2Token}`)
      .send({ reason: "Admin 2 hold", version: 0 }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(
    statuses,
    [200, 409],
    "Exactly one hold succeeds (200) and one conflicts (409)",
  );

  const orderInDb = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderInDb.paymentSimulationStatus, "ON_HOLD");
  assert.equal(orderInDb.version, 1);

  const activeHolds = await prisma.orderHold.findMany({
    where: { orderId: order.id, releasedAt: null },
  });
  assert.equal(
    activeHolds.length,
    1,
    "Exactly one active hold record was created",
  );
});

test("TSR-02 Concurrency: Dispute Decision vs T&S Hold race on Order CAS", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  const order = await makeOrder("completed");

  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "Race test" });
  assert.equal(openRes.status, 201);
  const disputeId = openRes.body.id;

  // Agent 1 claims the dispute
  await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ version: 0 });

  const orderDb = await prisma.order.findUnique({ where: { id: order.id } });

  // Concurrently race Decision vs T&S Hold
  const [decisionRes, holdRes] = await Promise.all([
    request(app)
      .post(`/disputes/${disputeId}/decision`)
      .set("Authorization", `Bearer ${agent1Token}`)
      .send({
        decision: "APPROVE_REFUND",
        reason: "ตัดสินคืนเงิน",
        version: 1,
      }),
    request(app)
      .post(`/admin/${order.id}/hold`)
      .set("Authorization", `Bearer ${tsAgentToken}`)
      .send({ reason: "T&S Hold แข่งกับ Decision", version: orderDb.version }),
  ]);

  const statuses = [decisionRes.status, holdRes.status];
  assert.ok(
    statuses.includes(200) && statuses.includes(409),
    `Expected one 200 and one 409, got: ${JSON.stringify(statuses)}`,
  );
});

test("TSR-02 Concurrency: Hold eligibility & Concurrent Pay", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  // 1. T&S cannot hold an order with pending_payment status (Requirement 6)
  const pendingOrder = await makeOrder("pending_payment");
  const holdPendingRes = await request(app)
    .post(`/admin/${pendingOrder.id}/hold`)
    .set("Authorization", `Bearer ${tsAgentToken}`)
    .send({ reason: "Hold pending", version: 0 });
  assert.equal(holdPendingRes.status, 400);

  // 2. Race 2 concurrent pay() calls with version 0 on the same pending_payment order
  const [payRes1, payRes2] = await Promise.all([
    request(app)
      .patch(`/${pendingOrder.id}/pay`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({}),
    request(app)
      .patch(`/${pendingOrder.id}/pay`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({}),
  ]);

  const payStatuses = [payRes1.status, payRes2.status].sort();
  assert.deepEqual(
    payStatuses,
    [200, 409],
    "Exactly one pay() succeeds (200) and one conflicts (409)",
  );

  // 3. If an order has active hold/dispute, pay() is guarded and rejected
  const disputedOrder = await makeOrder("completed");
  await request(app)
    .post(`/${disputedOrder.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "Disputed" });

  const payHeldRes = await request(app)
    .patch(`/${disputedOrder.id}/pay`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({});
  assert.ok([400, 409].includes(payHeldRes.status));
});

test("TSR-02: Payment outbox survives product-service failure and retries", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  const originalSetProductStatus = productClient.setProductStatus;
  t.after(() => {
    productClient.setProductStatus = originalSetProductStatus;
  });

  const order = await makeOrder("pending_payment");
  productClient.setProductStatus = async () => {
    throw new Error("simulated product-service outage");
  };

  const accepted = await request(app)
    .patch(`/${order.id}/pay`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({});
  assert.equal(accepted.status, 202);
  assert.equal(accepted.body.status, "completed");
  assert.equal(accepted.body.productSyncPending, true);

  const pendingEvent = await prisma.productSyncEvent.findFirst({
    where: { orderId: order.id, processedAt: null },
  });
  assert.ok(pendingEvent);
  assert.equal(pendingEvent.attempts, 1);

  productClient.setProductStatus = async () => ({ ok: true });
  const retried = await request(app)
    .patch(`/${order.id}/pay`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({});
  assert.equal(retried.status, 200);
  assert.equal(retried.body.status, "completed");

  const processedEvent = await prisma.productSyncEvent.findUnique({
    where: { id: pendingEvent.id },
  });
  assert.ok(processedEvent.processedAt);
});

test("TSR-02 Concurrency: Reassign vs Decision race on Dispute", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  const order = await makeOrder("completed");
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "Reassign vs Decision race" });
  const disputeId = openRes.body.id;

  // Agent 1 claims
  await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ version: 0 });

  // Race Reassign to Agent 2 vs Decision by Agent 1 with same version 1
  const [reassignRes, decideRes] = await Promise.all([
    request(app)
      .post(`/disputes/${disputeId}/reassign`)
      .set("Authorization", `Bearer ${agent1Token}`)
      .send({ toUserId: agent2Id, reason: "แข่งโอน", version: 1 }),
    request(app)
      .post(`/disputes/${disputeId}/decision`)
      .set("Authorization", `Bearer ${agent1Token}`)
      .send({ decision: "REJECT", reason: "แข่งตัดสิน", version: 1 }),
  ]);

  const statuses = [reassignRes.status, decideRes.status].sort();
  assert.deepEqual(
    statuses,
    [200, 409],
    "Exactly one succeeds (200) and one conflicts (409)",
  );
});

test("TSR-02: Hold decoupling between CS dispute and Trust & Safety holds", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  const order = await makeOrder("completed");

  // 1. Open dispute -> creates DISPUTE hold
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "ขอเปิดเคสตรวจสอบ" });
  assert.equal(openRes.status, 201);
  const disputeId = openRes.body.id;

  let orderDb = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderDb.payoutHeld, true);
  assert.equal(orderDb.status, "disputed");

  // CS claims dispute before deciding
  const claimRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ version: 0 });
  assert.equal(claimRes.status, 200);

  // 2. Trust & Safety places an administrative hold
  orderDb = await prisma.order.findUnique({ where: { id: order.id } });
  const tsHoldRes = await request(app)
    .post(`/admin/${order.id}/hold`)
    .set("Authorization", `Bearer ${tsAgentToken}`)
    .send({ reason: "T&S ตรวจสอบความปลอดภัยควบคู่", version: orderDb.version });
  assert.equal(tsHoldRes.status, 200);

  // Check that 2 active holds exist
  const activeHolds = await prisma.orderHold.findMany({
    where: { orderId: order.id, releasedAt: null },
  });
  assert.equal(activeHolds.length, 2);

  // 3. CS decides to REJECT the dispute -> releases only DISPUTE hold
  const rejectRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({
      decision: "REJECT",
      reason: "หลักฐานผู้ซื้อไม่ชัดเจน ยกเลิกข้อพิพาท",
      version: claimRes.body.version,
    });
  assert.equal(rejectRes.status, 200);

  // Order payout must REMAIN HELD because T&S hold is still active!
  orderDb = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderDb.payoutHeld, true);

  const holdsAfterDisputeReject = await prisma.orderHold.findMany({
    where: { orderId: order.id, releasedAt: null },
  });
  assert.equal(holdsAfterDisputeReject.length, 1);
  assert.equal(holdsAfterDisputeReject[0].source, "TRUST_AND_SAFETY");

  // 4. Now Trust & Safety releases their hold
  const tsReleaseRes = await request(app)
    .post(`/admin/${order.id}/release`)
    .set("Authorization", `Bearer ${tsAgentToken}`)
    .send({ reason: "ตรวจสอบเสร็จสิ้น ปลอดภัย", version: orderDb.version });
  assert.equal(tsReleaseRes.status, 200);

  // Now all holds released -> payoutHeld becomes false, heldBy cleared, status returns to preDisputeStatus (completed)
  orderDb = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderDb.payoutHeld, false);
  assert.equal(orderDb.status, "completed");
  assert.equal(orderDb.heldBy, null);
  assert.equal(orderDb.heldAt, null);
  assert.equal(orderDb.holdReason, null);
});

test("TSR-02: Approving refund locks order status — subsequent T&S release never reverts to completed", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  let order = await makeOrder("completed");

  // 1. T&S places administrative hold first
  const tsHoldRes = await request(app)
    .post(`/admin/${order.id}/hold`)
    .set("Authorization", `Bearer ${tsAgentToken}`)
    .send({ reason: "ระงับเงินก่อน", version: order.version });
  assert.equal(tsHoldRes.status, 200);

  order = await prisma.order.findUnique({ where: { id: order.id } });

  // 2. Buyer opens dispute
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "สินค้าของปลอม" });
  assert.equal(openRes.status, 201);
  const disputeId = openRes.body.id;

  // Agent 1 claims dispute
  const claimRes = await request(app)
    .post(`/disputes/${disputeId}/claim`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({ version: 0 });
  assert.equal(claimRes.status, 200);

  // 3. CS decides APPROVE_REFUND
  const decideRes = await request(app)
    .post(`/disputes/${disputeId}/decision`)
    .set("Authorization", `Bearer ${agent1Token}`)
    .send({
      decision: "APPROVE_REFUND",
      reason: "ของปลอมจริง คืนเงินผู้ซื้อ",
      version: claimRes.body.version,
    });
  assert.equal(decideRes.status, 200);

  let orderDb = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderDb.status, "refunded");

  // 4. T&S releases their hold -> status MUST NOT revert to completed!
  const tsReleaseRes = await request(app)
    .post(`/admin/${order.id}/release`)
    .set("Authorization", `Bearer ${tsAgentToken}`)
    .send({ reason: "ปลดระงับเงิน", version: orderDb.version });
  assert.equal(tsReleaseRes.status, 200);

  orderDb = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(orderDb.status, "refunded");
  assert.equal(orderDb.payoutHeld, false);
  assert.equal(orderDb.heldBy, null);
});

test("TSR-02: Participants cannot mutate order status while under active hold or dispute", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("DATABASE_URL not reachable");
    return;
  }

  const order = await makeOrder("completed");

  // Buyer opens dispute
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "สินค้าไม่ถึงมือ" });
  assert.equal(openRes.status, 201);

  // Seller tries to update status to "cancelled" -> 409 Conflict
  const sellerUpdateRes = await request(app)
    .patch(`/${order.id}/status`)
    .set("Authorization", `Bearer ${sellerToken}`)
    .send({ status: "cancelled" });
  assert.equal(sellerUpdateRes.status, 409);
  assert.ok(
    sellerUpdateRes.body.error?.includes("ระงับ") ||
      sellerUpdateRes.body.error?.includes("ข้อพิพาท") ||
      sellerUpdateRes.body.error?.includes("dispute"),
  );
});
