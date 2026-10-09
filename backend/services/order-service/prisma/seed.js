// Idempotent demo fixtures for the approved ER; never rewrites existing records.
const { PrismaClient } = require("../src/generated/prisma-client");
const prisma = new PrismaClient();
const BUYER = "30000000-0000-0000-0000-000000000001";
const CS = "20000000-0000-0000-0000-000000000001";
async function main() {
  const amounts = [890, 690, 450];
  const statuses = ["disputed", "refunded", "completed"];
  for (let i = 0; i < 3; i++) {
    const id = "d0000000-0000-0000-0000-00000000000" + (i + 1);
    await prisma.order.upsert({
      where: { id },
      update: {},
      create: {
        id,
        buyerId: BUYER,
        sellerId: "10000000-0000-0000-0000-00000000000" + (i + 1),
        productId: ["p01", "p05", "p09"][i],
        orderType: "BUY_NOW",
        originalAmount: amounts[i],
        ordersAmount: amounts[i],
        status: statuses[i],
        preDisputeStatus: i === 0 ? "completed" : null,
      },
    });
    const paymentId = id + "-payment";
    await prisma.payment.upsert({
      where: { id: paymentId },
      update: {},
      create: {
        id: paymentId,
        orderId: id,
        paymentType: "DEMO",
        paymentStatus: "paid",
        paymentAmount: amounts[i],
        paidAt: new Date(),
      },
    });
    if (i === 2) continue;
    const caseId = "e0000000-0000-0000-0000-00000000000" + (i + 1);
    await prisma.disputeCase.upsert({
      where: { id: caseId },
      update: {},
      create: {
        id: caseId,
        orderId: id,
        createdBy: BUYER,
        reason: i === 0 ? "สินค้าเสียหาย" : "ขนาดสินค้าไม่ตรง",
        disputeType: "ITEM_NOT_AS_DESCRIBED",
        ...(i === 1
          ? {
              decision: "APPROVE_REFUND",
              decidedBy: CS,
              decidedAt: new Date(),
              assignedTo: CS,
              assignedRole: "CUSTOMER_SERVICE",
              assignedAt: new Date(),
            }
          : {}),
        caseLog: {
          create: { actorId: BUYER, action: "OPEN", detail: "Demo complaint" },
        },
      },
    });
    if (i === 0)
      await prisma.hold.upsert({
        where: { id: caseId + "-hold" },
        update: {},
        create: {
          id: caseId + "-hold",
          paymentId,
          source: "DISPUTE",
          referenceId: caseId,
          holdReason: "สินค้าเสียหาย",
          holdStatus: "ON_HOLD",
          holdAmount: amounts[i],
          holdAt: new Date(),
          holdBy: BUYER,
        },
      });
  }
  console.log("[order-service] seeded 3 demo orders and 2 demo cases");
}
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
