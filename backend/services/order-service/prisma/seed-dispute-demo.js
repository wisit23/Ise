// Manual-QA fixture for ADM-004 (Dispute Evidence and Simulated Fund Hold) —
// NOT run automatically by Docker. Run with `npm run seed:dispute-demo` to get
// an order + evidence to click through at /admin/disputes/<id>. Idempotent:
// fixed ids, safe to re-run. sellerId matches the fixed demo seller from
// auth-service/prisma/seed.js so the order looks like a real listing.
require("dotenv").config();
const { PrismaClient } = require("../src/generated/prisma-client");

const prisma = new PrismaClient();

const ORDER_ID = "30000000-0000-0000-0000-000000000001";
const EVIDENCE_ID = "30000000-0000-0000-0000-000000000002";

async function main() {
  await prisma.order.upsert({
    where: { id: ORDER_ID },
    update: {
      status: "shipped",
      paymentSimulationStatus: "RELEASE_PENDING",
      version: 1,
      holdReason: null,
      heldAt: null,
      heldBy: null,
      preDisputeStatus: null,
    },
    create: {
      id: ORDER_ID,
      buyerId: "20000000-0000-0000-0000-000000000003", // matches demo reporter in auth-service seed-report-demo.js
      sellerId: "10000000-0000-0000-0000-000000000001", // matches auth-service/prisma/seed.js demo seller
      productId: "demo-dispute-product",
      productTitle: "เสื้อยืดวินเทจทดสอบ",
      price: 590,
      status: "shipped",
    },
  });

  await prisma.adminDisputeEvidence.upsert({
    where: { id: EVIDENCE_ID },
    update: {},
    create: {
      id: EVIDENCE_ID,
      orderId: ORDER_ID,
      evidenceRef: "https://example.com/chat-screenshot.png",
      note: "ผู้ซื้อแจ้งว่าไม่ได้รับสินค้า",
      submittedBy: "cs-agent-demo",
    },
  });

  console.log(`[order-service] demo dispute order ready: ${ORDER_ID}`);
  console.log(`[order-service] เปิด /admin/disputes/${ORDER_ID} เพื่อดู`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
