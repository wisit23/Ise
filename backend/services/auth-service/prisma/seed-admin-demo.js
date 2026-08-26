// Manual-QA fixture for the Admin feature (ADM-001–ADM-005) — NOT run
// automatically by Docker (see the "prisma": {"seed": ...} field in
// package.json, which only points at seed.js). Run explicitly with
// `npm run seed:admin-demo` when you need a real ADMIN account to click
// through /admin/* pages locally. Idempotent: fixed email, safe to re-run.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@test.local";
const ADMIN_PASSWORD = "AdminPass123!";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: "Admin",
      lastName: "Demo",
      role: "ADMIN",
    },
  });

  console.log(`[auth-service] demo admin ready: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`[auth-service] user id: ${user.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
