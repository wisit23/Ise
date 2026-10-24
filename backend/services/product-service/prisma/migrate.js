require("dotenv").config();
const { spawnSync } = require("node:child_process"),
  path = require("node:path");
const prisma = require("../src/models/prismaClient");
const BASELINE = "20261011000000_unified_product_baseline";

async function remediateInvalidPrices(db = prisma) {
  const invalidProducts =
    await db.$queryRaw`SELECT id, price FROM products WHERE price <= 0`;
  if (invalidProducts && invalidProducts.length > 0) {
    console.warn(
      `[product-migrate] Found ${invalidProducts.length} product(s) with invalid price <= 0. Remediating before migration...`,
    );
    await db.$executeRaw`UPDATE products SET price = 1 WHERE price <= 0`;
  }
  return invalidProducts?.length || 0;
}

async function main(db = prisma) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const tables =
    await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`;
  const names = new Set(tables.map((row) => row.table_name));
  let known = false;
  if (names.has("_prisma_migrations")) {
    const applied =
      await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name=${BASELINE} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    known = applied.length > 0;
  }
  if (!known && names.size > 0) {
    throw new Error(
      "Product cutover BLOCKED: existing database requires a reviewed migration preserving products, auction rounds, reviews, moderation commands and campaign attribution. Do not baseline or db push this database. Use a new empty database for migration rehearsal.",
    );
  }

  // Inspect and remediate legacy invalid product prices before running migrations
  if (names.has("products")) {
    await remediateInvalidPrices(db);
  }

  await db.$disconnect();
  const result = spawnSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
    { cwd: path.resolve(__dirname, ".."), stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Product migration deploy failed");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("[product-migrate]", error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { main, remediateInvalidPrices };
