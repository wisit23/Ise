// Manual-QA fixture for ADM-002 (Test-KYC Review Queue) — NOT run automatically
// by Docker. Run with `npm run seed:kyc-demo` to get a PENDING KycApplication
// to click through at /admin/kyc. Idempotent: fixed ids, safe to re-run.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const SELLER_ID = "20000000-0000-0000-0000-000000000001";
const APPLICATION_ID = "20000000-0000-0000-0000-000000000002";

async function main() {
  await prisma.user.upsert({
    where: { id: SELLER_ID },
    update: {},
    create: {
      id: SELLER_ID,
      email: "demo-kyc-seller@example.test",
      passwordHash: await bcrypt.hash("irrelevant", 10),
      firstName: "ทดสอบ",
      lastName: "ผู้ขาย KYC",
      role: "SELLER",
      sellerProfile: { create: { shopName: "ร้านทดสอบ KYC" } },
    },
  });

  await prisma.kycApplication.upsert({
    where: { id: APPLICATION_ID },
    update: {
      status: "PENDING",
      reason: null,
      decidedAt: null,
      decidedBy: null,
      version: 1,
    },
    create: {
      id: APPLICATION_ID,
      userId: SELLER_ID,
      documentUrl: "https://example.com/id-card.jpg",
    },
  });

  console.log(`[auth-service] demo KYC application ready: ${APPLICATION_ID}`);
  console.log("[auth-service] เปิด /admin/kyc เพื่อดู");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
