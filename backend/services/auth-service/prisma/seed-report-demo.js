// Manual-QA fixture for ADM-003 (Reports, User Suspension) — NOT run
// automatically by Docker. Run with `npm run seed:report-demo` to get an OPEN
// report to click through at /admin/reports. Idempotent: fixed ids, safe to re-run.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const REPORTER_ID = "20000000-0000-0000-0000-000000000003";
const TARGET_ID = "20000000-0000-0000-0000-000000000004";
const REPORT_ID = "20000000-0000-0000-0000-000000000005";

async function main() {
  await prisma.user.upsert({
    where: { id: REPORTER_ID },
    update: {},
    create: {
      id: REPORTER_ID,
      email: "demo-reporter@example.test",
      passwordHash: await bcrypt.hash("irrelevant", 10),
      firstName: "ผู้แจ้ง",
      lastName: "ทดสอบ",
      role: "BUYER",
    },
  });
  await prisma.user.upsert({
    where: { id: TARGET_ID },
    update: { status: "ACTIVE" },
    create: {
      id: TARGET_ID,
      email: "demo-report-target@example.test",
      passwordHash: await bcrypt.hash("irrelevant", 10),
      firstName: "ผู้ถูกแจ้ง",
      lastName: "ทดสอบ",
      role: "BUYER",
    },
  });

  await prisma.report.upsert({
    where: { id: REPORT_ID },
    update: {
      status: "OPEN",
      reviewedAt: null,
      reviewedBy: null,
      actionTaken: null,
    },
    create: {
      id: REPORT_ID,
      reporterId: REPORTER_ID,
      targetId: TARGET_ID,
      reason: "ส่งข้อความหยาบคาย (ทดสอบ)",
    },
  });

  console.log(`[auth-service] demo report ready: ${REPORT_ID}`);
  console.log(`[auth-service] target user id: ${TARGET_ID}`);
  console.log("[auth-service] เปิด /admin/reports เพื่อดู");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
