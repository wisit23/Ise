// Safely baseline the earlier db-push installation, then deploy versioned migrations.
require("dotenv").config();
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const prisma = require("../src/models/prismaClient");
const cli = require.resolve("prisma/build/index.js");
const BASELINE = "20261005000000_support_baseline";
function run(args) {
  const result = spawnSync(process.execPath, [cli, "migrate", ...args], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Prisma migration command failed");
}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const [{ legacy, ledger }] = await prisma.$queryRaw`
    SELECT to_regclass('public.support_tickets')::text AS legacy,
           to_regclass('public._prisma_migrations')::text AS ledger`;
  let applied = false;
  if (ledger) {
    const rows = await prisma.$queryRaw`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE migration_name = ${BASELINE} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    applied = rows.length > 0;
  }
  if (legacy && !applied) {
    const [{ count }] = await prisma.$queryRaw`
      SELECT count(*)::int AS count FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('support_tickets','ticket_messages','ticket_audit_logs','help_articles')`;
    if (count !== 4)
      throw new Error(
        "Incomplete legacy Support schema: restore/upgrade it before baselining",
      );
    await prisma.$disconnect();
    // Resolve records the known pre-normalization schema; it does not recreate or delete data.
    run(["resolve", "--applied", BASELINE]);
  }
  await prisma.$disconnect();
  run(["deploy"]);
}
if (require.main === module)
  main()
    .catch((error) => {
      console.error("[support-migrate]", error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
module.exports = { main };
