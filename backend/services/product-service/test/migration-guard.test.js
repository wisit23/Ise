const test = require("node:test");
const assert = require("node:assert/strict");
const { main, remediateInvalidPrices } = require("../prisma/migrate");

test("migration refuses an existing database without the canonical baseline, including a legacy ledger", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL =
    "postgresql://fixture:fixture@127.0.0.1:1/guard_only";
  try {
    for (const tables of [
      ["orders"],
      ["products"],
      ["orders", "_prisma_migrations"],
      ["_prisma_migrations"],
    ]) {
      let writes = 0;
      const db = {
        $queryRaw: async (strings) =>
          strings.join("").includes("information_schema")
            ? tables.map((table_name) => ({ table_name }))
            : [],
        $disconnect: async () => {},
        $executeRaw: async () => {
          writes++;
        },
      };
      await assert.rejects(main(db), /cutover BLOCKED/);
      assert.equal(writes, 0);
    }
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("remediateInvalidPrices finds products with price <= 0 and updates them to 1", async () => {
  const invalidRows = [
    { id: "p1", price: 0 },
    { id: "p2", price: -50 },
  ];
  let executeCall = null;
  const db = {
    $queryRaw: async (strings) => {
      const sql = strings.join("");
      if (sql.includes("price <= 0")) return invalidRows;
      return [];
    },
    $executeRaw: async (strings) => {
      executeCall = strings.join("");
      return invalidRows.length;
    },
  };

  const count = await remediateInvalidPrices(db);
  assert.equal(count, 2);
  assert.ok(
    executeCall.includes("UPDATE products SET price = 1 WHERE price <= 0"),
  );
});

test("remediateInvalidPrices does nothing when all product prices are valid", async () => {
  let writes = 0;
  const db = {
    $queryRaw: async () => [],
    $executeRaw: async () => {
      writes++;
    },
  };

  const count = await remediateInvalidPrices(db);
  assert.equal(count, 0);
  assert.equal(writes, 0);
});
