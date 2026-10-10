const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const BASELINE_MIGRATIONS = [
  "20260824151942_add_multi_role_foundation",
  "20260824194716_add_kyc_applications",
  "20260824200031_add_reports_and_admin_audit",
  "20260824202600_add_bulk_action_runs",
  "20260912120000_add_buyer_activity_audit",
];

function runPrisma(args) {
  const prismaCli = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `prisma ${args.join(" ")} exited with code ${result.status}`,
    );
  }
}

async function inspectDatabase() {
  const [state] = await prisma.$queryRaw`
    SELECT
      to_regclass('public._prisma_migrations') IS NOT NULL AS "hasMigrationTable",
      (
        SELECT COUNT(*)::int
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
      ) AS "userTableCount"
  `;

  let migrationCount = 0;
  if (state.hasMigrationTable) {
    const [count] = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    migrationCount = count.count;
  }

  return { ...state, migrationCount };
}

async function main() {
  const state = await inspectDatabase();
  await prisma.$disconnect();

  const needsBaseline = state.userTableCount > 0 && state.migrationCount === 0;
  if (needsBaseline) {
    console.log(
      "Existing auth schema has no Prisma migration history; recording the known legacy migrations.",
    );
    for (const migration of BASELINE_MIGRATIONS) {
      runPrisma(["migrate", "resolve", "--applied", migration]);
    }
  }

  runPrisma(["migrate", "deploy"]);
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exitCode = 1;
});
