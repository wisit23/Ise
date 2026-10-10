require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const prisma = require("../src/models/prismaClient");
async function applyServicePolicy(db = prisma) {
  const sql = fs.readFileSync(
    path.join(__dirname, "migrations/20261009_cs_service_policy/migration.sql"),
    "utf8",
  );
  await db.$executeRawUnsafe(sql);
}
if (require.main === module)
  applyServicePolicy()
    .then(() =>
      console.log("Dispute SLA columns ready; existing deadlines preserved"),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
module.exports = { applyServicePolicy };
