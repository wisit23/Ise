// Manual browser-QA fixtures for TSR-01 Ban enforcement. This seed is not
// part of the automatic Docker startup seed. It resets only the two dedicated
// demo accounts below, making repeated Ban/Restore checks deterministic.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const FIXTURES = [
  {
    label: "Trust & Safety",
    email: "trust.ban@test.local",
    password: "BanDemo123!",
    firstName: "Trust & Safety",
    lastName: "Ban Demo",
    role: "TRUST_AND_SAFETY",
  },
  {
    label: "Ban target",
    email: "buyer.ban@test.local",
    password: "BanDemo123!",
    firstName: "ผู้ใช้",
    lastName: "ทดสอบการระงับ",
    role: "BUYER",
  },
];

async function resetFixture(fixture) {
  const passwordHash = await bcrypt.hash(fixture.password, 10);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: fixture.email },
      update: {
        passwordHash,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        role: fixture.role,
        status: "ACTIVE",
      },
      create: {
        email: fixture.email,
        passwordHash,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        role: fixture.role,
        status: "ACTIVE",
      },
    });

    // UserRole becomes the source of truth as soon as any row exists. Reset it
    // with the legacy role column so the demo token always has the intended
    // permission set, even after someone edited this fixture in an earlier run.
    await tx.userRole.deleteMany({ where: { userId: user.id } });
    await tx.userRole.create({
      data: { userId: user.id, role: fixture.role },
    });

    // Starting a new manual run must invalidate browser sessions left by the
    // previous run. The tester gets a fresh sid on the next login.
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return user;
  });
}

async function main() {
  console.log("[auth-service] Ban browser-QA accounts reset to ACTIVE:\n");
  for (const fixture of FIXTURES) {
    const user = await resetFixture(fixture);
    console.log(
      `- ${fixture.label}: ${fixture.email} / ${fixture.password} (id: ${user.id})`,
    );
  }
  console.log(
    "\nOpen http://localhost:3000/login. Use separate browser profiles for the buyer and Trust & Safety sessions.",
  );
  console.log(
    "In /workspace, open ศูนย์ค้นหาข้อมูล Trust & Safety, search buyer.ban@test.local, then Ban/Restore the account.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
