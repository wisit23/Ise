const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
if (process.env.DATABASE_URL_SUPPORT)
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
const supportDb = require("../../services/support-service/src/models/prismaClient");
const orderDb = require("../../services/order-service/src/models/prismaClient");
const ticketService = require("../../services/support-service/src/features/tickets/ticketService");
const ticketModel = require("../../services/support-service/src/features/tickets/ticketModel");
const orderClient = require("../../services/support-service/src/services/orderClient");
const riskClient = require("../../services/support-service/src/services/riskClient");
const supportChat = require("../../services/support-service/src/services/chatClient");
const disputeService = require("../../services/order-service/src/features/disputes/disputeService");
const disputeModel = require("../../services/order-service/src/features/disputes/disputeModel");
const authClient = require("../../services/order-service/src/services/authClient");
const {
  seedReferenceData,
} = require("../../services/support-service/prisma/seedReferenceData");
const {
  applyServicePolicy,
} = require("../../services/order-service/prisma/applyServicePolicy");
const { disputeSla, POLICY_VERSION } = require("./servicePolicy");

test("persisted intake, separate clocks, handoffs, legacy preservation and priority filters", async (t) => {
  const safe = ["SUPPORT", "ORDER"].every(
    (kind) =>
      process.env[`DATABASE_URL_${kind}`] &&
      new URL(process.env[`DATABASE_URL_${kind}`]).pathname.startsWith(
        "/reloop_ui_",
      ),
  );
  if (!safe) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Requires dedicated reloop_ui_* databases");
    t.skip("Set dedicated DATABASE_URL_SUPPORT and DATABASE_URL_ORDER");
    return;
  }
  const tag = `policy-${randomUUID()}`;
  const buyer = `${tag}-buyer`;
  t.after(async () => {
    await supportDb.supportTicket.deleteMany({ where: { requesterId: buyer } });
    await orderDb.disputeCase.deleteMany({ where: { openedBy: buyer } });
    await orderDb.order.deleteMany({ where: { buyerId: buyer } });
    await Promise.all([supportDb.$disconnect(), orderDb.$disconnect()]);
  });
  await applyServicePolicy(orderDb);
  await applyServicePolicy(orderDb); // Additive migration is repeatable.
  await seedReferenceData(supportDb);
  const policies = await supportDb.slaPolicy.findMany({
    where: { id: { endsWith: POLICY_VERSION } },
  });
  assert.equal(policies.length, 4);
  const makeOrder = (price) =>
    orderDb.order.create({
      data: {
        buyerId: buyer,
        sellerId: `${tag}-seller`,
        productId: tag,
        productTitle: tag,
        price,
        status: "completed",
      },
    });
  t.mock.method(orderClient, "getOrder", (id) =>
    orderDb.order.findUnique({ where: { id } }),
  );
  t.mock.method(riskClient, "getReportCount", async () => {
    throw new Error("test risk service unavailable");
  });
  t.mock.method(supportChat, "createSupportConversation", async () => null);
  t.mock.method(authClient, "getUser", async () => {
    throw new Error("test risk service unavailable");
  });

  const legacyTicket = await ticketModel.create({
    requesterId: buyer,
    subject: tag,
    category: "OTHER",
    priority: "NORMAL",
    createdAt: new Date("2020-01-01T00:00:00Z"),
  });
  const oldTargets = await supportDb.ticketSlaTarget.findMany({
    where: { ticketId: legacyTicket.id },
    orderBy: { metricType: "asc" },
  });
  assert.ok(oldTargets.every((target) => target.policyId.endsWith("-v1")));
  await seedReferenceData(supportDb);
  assert.deepEqual(
    await supportDb.slaPolicy.findMany({
      where: { id: { endsWith: POLICY_VERSION } },
    }),
    policies,
  );
  assert.deepEqual(
    await supportDb.ticketSlaTarget.findMany({
      where: { ticketId: legacyTicket.id },
      orderBy: { metricType: "asc" },
    }),
    oldTargets,
  );

  const paymentOrder = await makeOrder(1500);
  const ticket = await ticketService.createTicket({
    requesterId: buyer,
    subject: `${tag} ตรวจยอดเงิน`,
    category: "PAYMENT",
    orderId: paymentOrder.id,
  });
  assert.equal(ticket.priority, "HIGH");
  assert.equal(ticket.riskReportCount, 0);
  const targets = await supportDb.ticketSlaTarget.findMany({
    where: { ticketId: ticket.id },
  });
  const response = targets.find(
    (target) => target.metricType === "FIRST_RESPONSE",
  );
  const resolution = targets.find(
    (target) => target.metricType === "RESOLUTION",
  );
  assert.equal(+response.dueAt - +ticket.createdAt, 2 * 3600000);
  assert.equal(+resolution.dueAt - +ticket.createdAt, 24 * 3600000);
  assert.ok(
    targets.every((target) => target.policyId.endsWith(POLICY_VERSION)),
  );
  const classification = await supportDb.ticketAuditLog.findFirst({
    where: { ticketId: ticket.id, action: "CLASSIFY" },
  });
  assert.equal(classification.payload.riskLookupAvailable, false);
  assert.ok(
    classification.payload.reasonCodes.includes("ORDER_PAYMENT_AT_RISK"),
  );
  await ticketModel.recordChatMessage({
    ticketId: ticket.id,
    chatMessageId: tag,
    authorId: `${tag}-agent`,
    authorRole: "AGENT",
    isInternal: false,
  });
  assert.equal(
    (await ticketModel.findById(ticket.id)).sla.metric,
    "RESOLUTION",
  );
  assert.equal(
    +(
      await supportDb.ticketSlaTarget.findUnique({
        where: { id: resolution.id },
      })
    ).dueAt,
    +resolution.dueAt,
  );
  const queue = await ticketService.listQueue({
    role: "CUSTOMER_SERVICE",
    userId: `${tag}-agent`,
    scope: "all",
    search: tag,
    priority: "HIGH",
    sort: "priority",
  });
  assert.ok(queue.items.some((item) => item.id === ticket.id));
  assert.ok(queue.items.every((item) => item.priority === "HIGH"));

  const disputeOrder = await makeOrder(1500);
  const dispute = await disputeService.open({
    orderId: disputeOrder.id,
    userId: buyer,
    reason: tag,
  });
  assert.equal(dispute.priority, "HIGH");
  assert.equal(dispute.riskReportCount, 0);
  assert.equal(+dispute.firstReviewDueAt - +dispute.createdAt, 2 * 3600000);
  assert.equal(+dispute.decisionDueAt - +dispute.createdAt, 7 * 86400000);
  assert.equal(disputeSla(dispute).metric, "FIRST_REVIEW");
  const claim = await disputeModel.claim({
    id: dispute.id,
    version: 0,
    userId: `${tag}-agent`,
    role: "CUSTOMER_SERVICE",
  });
  assert.ok(claim.firstReviewedAt);
  assert.equal(+claim.slaExpiresAt, +dispute.decisionDueAt);
  const escalated = await disputeModel.escalate({
    id: dispute.id,
    version: claim.version,
    actorId: `${tag}-agent`,
    reason: "Admin decision",
  });
  const adminClaim = await disputeModel.claim({
    id: dispute.id,
    version: escalated.version,
    userId: `${tag}-admin`,
    role: "ADMIN",
  });
  assert.equal(+adminClaim.firstReviewedAt, +claim.firstReviewedAt);
  assert.equal(+adminClaim.slaExpiresAt, +dispute.decisionDueAt);
  const legacyOrder = await makeOrder(100);
  const originalDue = new Date("2026-01-01T00:00:00Z");
  const legacyDispute = await disputeModel.openDispute({
    orderId: legacyOrder.id,
    openedBy: buyer,
    reason: tag,
    priority: "CRITICAL",
    priorityScore: 90,
    slaExpiresAt: originalDue,
  });
  const legacyClaim = await disputeModel.claim({
    id: legacyDispute.id,
    version: 0,
    userId: `${tag}-agent`,
    role: "CUSTOMER_SERVICE",
  });
  assert.equal(+legacyClaim.slaExpiresAt, +originalDue);
  assert.equal(legacyClaim.firstReviewedAt, null);
  const urgentOrder = await makeOrder(10000);
  const urgent = await disputeService.open({
    orderId: urgentOrder.id,
    userId: buyer,
    reason: tag,
  });
  assert.equal(urgent.priority, "URGENT");
  assert.equal(+urgent.firstReviewDueAt - +urgent.createdAt, 30 * 60000);
  assert.equal(+urgent.decisionDueAt - +urgent.createdAt, 4 * 86400000);
  const routed = await disputeModel.reassign({
    id: urgent.id,
    version: urgent.version,
    actorId: `${tag}-supervisor`,
    toUserId: `${tag}-agent`,
    toRole: "CUSTOMER_SERVICE",
    reason: "Triage by supervisor",
  });
  assert.ok(routed.firstReviewedAt);
  assert.equal(+routed.slaExpiresAt, +urgent.decisionDueAt);
  const priorityQueue = await disputeService.listQueue({
    role: "ADMIN",
    userId: `${tag}-admin`,
    scope: "all",
    search: tag,
    sort: "priority",
    skip: 0,
    take: 2,
  });
  assert.deepEqual(
    priorityQueue.items.map((item) => item.priority),
    ["CRITICAL", "URGENT"],
  );
  assert.equal(
    (
      await disputeService.listQueue({
        role: "ADMIN",
        userId: `${tag}-admin`,
        search: tag,
        priority: "CRITICAL",
        skip: 0,
        take: 20,
        sort: "priority",
      })
    ).items[0].priority,
    "CRITICAL",
  );
});
