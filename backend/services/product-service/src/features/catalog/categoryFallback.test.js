const test = require("node:test");
const assert = require("node:assert/strict");
const { Prisma, PrismaClient } = require("../../generated/prisma-client");
const { buildCatalogWhere } = require("./catalogQuery");

test("category SQL supports legacy products and respects existing and removed memberships", async (t) => {
  const url = process.env.DATABASE_URL_PRODUCT || process.env.DATABASE_URL;
  if (!url) return t.skip("database URL unavailable");
  const db = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => db.$disconnect());
  // Session-local tables exercise the real SQL without changing catalog data.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE products (
      id text, category text, status text, moderated_at timestamp, deleted_at timestamp
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(
      "CREATE TEMP TABLE categories (id text, name text) ON COMMIT DROP",
    );
    await tx.$executeRawUnsafe(
      "CREATE TEMP TABLE product_categories (product_id text, category_id text, deleted_at timestamp) ON COMMIT DROP",
    );
    await tx.$executeRawUnsafe(`INSERT INTO products (id, category, status) VALUES
      ('legacy', 'bags', 'available'), ('linked', 'old', 'available'),
      ('removed-link', 'bags', 'available'), ('other-link', 'bags', 'available'),
      ('sold', 'bags', 'sold'), ('deleted', 'bags', 'available')`);
    await tx.$executeRawUnsafe(
      "UPDATE products SET deleted_at = now() WHERE id = 'deleted'",
    );
    await tx.$executeRawUnsafe(
      "INSERT INTO categories VALUES ('bags-id', 'bags'), ('shoes-id', 'shoes')",
    );
    await tx.$executeRawUnsafe(`INSERT INTO product_categories VALUES
      ('linked', 'bags-id', NULL), ('removed-link', 'bags-id', now()),
      ('other-link', 'shoes-id', NULL)`);
    const where = buildCatalogWhere({ category: "bags", status: "available" });
    const rows = await tx.$queryRaw(
      Prisma.sql`SELECT id FROM products WHERE ${where} ORDER BY id`,
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      ["legacy", "linked"],
    );
  });
});
