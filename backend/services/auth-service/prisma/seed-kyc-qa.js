// Additive local QA data: each run creates four fresh applications and keeps
// all previous users, decisions and audit records intact.
require("dotenv").config();
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const prisma = require(path.resolve("src/models/prismaClient"));
const { seedRoleCatalog } = require(path.resolve("prisma/roleCatalog"));
const { submitKyc } = require(path.resolve("src/features/kyc/kycService"));

const scenarios = [
  "อนุมัติโดยไม่กรอกหมายเหตุ",
  "อนุมัติโดยใช้ข้อความจากหน้ารายการ",
  "ปฏิเสธพร้อมเหตุผลจากหน้ารายการ",
  "แก้ไขข้อความในหน้าต่างยืนยัน",
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("KYC QA seed is for local testing only");
  await seedRoleCatalog(prisma);
  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  const created = [];
  for (const [index, scenario] of scenarios.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const user = await prisma.user.create({
      data: {
        email: `demo-kyc-qa-${randomUUID()}@example.test`,
        passwordHash,
        firstName: `DEMO KYC ${number}`,
        lastName: scenario,
        role: "BUYER",
        roles: { create: { role: "BUYER" } },
      },
    });
    const shopName = `[DEMO KYC ${number}] ${scenario}`;
    const result = await submitKyc({
      userId: user.id,
      shopName,
      verifyMethod: "thai_id",
      idCardNumber: "0000000000000",
      address: "ข้อมูลสมมติสำหรับทดสอบระบบเท่านั้น ไม่ใช่ที่อยู่จริง",
      bankAccount: "DEMO-NOT-A-REAL-ACCOUNT",
    });
    created.push({ shopName, applicationId: result.applicationId });
  }
  const pending = await prisma.kycApplication.count({
    where: { id: { in: created.map((item) => item.applicationId) }, status: "PENDING" },
  });
  if (pending !== scenarios.length) throw new Error("Not all QA applications are pending");
  console.log(JSON.stringify({ pending, applications: created }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
