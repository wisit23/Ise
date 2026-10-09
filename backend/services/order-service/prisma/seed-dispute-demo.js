// Manual QA fixture; explicit demo identities, idempotent and no resets.
require("dotenv").config();
const { PrismaClient } = require("../src/generated/prisma-client");
const prisma = new PrismaClient();
const ORDER_ID = "30000000-0000-0000-0000-000000000001";
const EVIDENCE_ID = "30000000-0000-0000-0000-000000000002";
async function main() {
  const buyerId = "20000000-0000-0000-0000-000000000003";
  await prisma.order.upsert({
    where: { id: ORDER_ID },
    update: {},
    create: {
      id: ORDER_ID,
      buyerId,
      sellerId: "10000000-0000-0000-0000-000000000001",
      productId: "demo-dispute-product",
      orderType: "BUY_NOW",
      originalAmount: "590.50",
      ordersAmount: "590.50",
      status: "disputed",
      preDisputeStatus: "completed",
    },
  });
  await prisma.payment.upsert({
    where: { id: ORDER_ID + "-payment" },
    update: {},
    create: {
      id: ORDER_ID + "-payment",
      orderId: ORDER_ID,
      paymentType: "DEMO",
      paymentStatus: "paid",
      paymentAmount: "590.50",
      paidAt: new Date(),
    },
  });
  const dispute = await prisma.disputeCase.upsert({
    where: { orderId: ORDER_ID },
    update: {},
    create: {
      orderId: ORDER_ID,
      createdBy: buyerId,
      reason: "ผู้ซื้อแจ้งว่าสินค้าเสียหาย",
      disputeType: "DAMAGED_ITEM",
      caseLog: {
        create: { actorId: buyerId, action: "OPEN", detail: "Demo complaint" },
      },
    },
  });
  await prisma.hold.upsert({
    where: { id: ORDER_ID + "-hold" },
    update: {},
    create: {
      id: ORDER_ID + "-hold",
      paymentId: ORDER_ID + "-payment",
      source: "DISPUTE",
      referenceId: dispute.id,
      holdReason: "Demo complaint",
      holdStatus: "ON_HOLD",
      holdAmount: "590.50",
      holdAt: new Date(),
      holdBy: buyerId,
    },
  });
  await prisma.disputeEvidence.upsert({
    where: { id: EVIDENCE_ID },
    update: {},
    create: {
      id: EVIDENCE_ID,
      disputeCaseId: dispute.id,
      uploaderId: buyerId,
      evidencePath: "demo-damage.jpg",
      fileType: "image/jpeg",
      status: "SUBMITTED",
      auditLog: {
        create: {
          actorId: buyerId,
          action: "UPLOAD",
          detail:
            "Demo evidence reference (supply a local demo-damage.jpg to view)",
        },
      },
    },
  });
  await prisma.safetyDisputeEvidence.upsert({
    where: { evidenceId: EVIDENCE_ID },
    update: {},
    create: {
      orderId: ORDER_ID,
      evidenceId: EVIDENCE_ID,
      status: "PENDING",
      logs: {
        create: {
          actorId: buyerId,
          action: "CREATED",
          detail: "Demo evidence awaiting review",
        },
      },
    },
  });
  console.log("[order-service] demo dispute ready: " + ORDER_ID);
}
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
