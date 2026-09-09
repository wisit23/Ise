const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
const { signAccessToken } = require("@reloop/shared");
if (process.env.DATABASE_URL_PRODUCT)
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

async function reachable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("catalog search applies all filters against PostgreSQL", async (t) => {
  if (!(await reachable())) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("REQUIRE_INTEGRATION=1 but PostgreSQL is unavailable");
    t.skip("PostgreSQL unavailable");
    return;
  }
  const prefix = `catalog-filter-${Date.now()}`;
  const rows = await prisma.product.createManyAndReturn({
    data: [
      {
        sellerId: "catalog-test",
        title: `${prefix}-match`,
        price: 900,
        category: "shoes",
        brand: "Acme",
        condition: "Good",
        size: "M",
        tags: ["vintage"],
      },
      {
        sellerId: "catalog-test",
        title: `${prefix}-wrong`,
        price: 900,
        category: "shoes",
        brand: "Other",
        condition: "Good",
        size: "M",
        tags: ["vintage"],
      },
      {
        sellerId: "catalog-test",
        title: `${prefix}-reserved`,
        price: 900,
        category: prefix,
        brand: "Acme",
        condition: "Good",
        size: "M",
        tags: ["vintage"],
        status: "reserved",
      },
      {
        sellerId: "catalog-test",
        title: `${prefix}-sold`,
        price: 900,
        category: prefix,
        brand: "Acme",
        condition: "Good",
        size: "M",
        tags: ["vintage"],
        status: "sold",
      },
      {
        sellerId: "catalog-test",
        title: `${prefix}-second-available`,
        price: 901,
        category: prefix,
        brand: "Acme",
        condition: "Good",
        size: "M",
        tags: ["vintage"],
      },
      {
        sellerId: "catalog-test",
        title: `${prefix}-third-available`,
        price: 902,
        category: prefix,
        brand: "Acme",
        condition: "Good",
        size: "M",
        tags: ["vintage"],
      },
      {
        sellerId: "catalog-test",
        title: `${prefix}-removed`,
        price: 903,
        category: prefix,
        brand: "Acme",
        condition: "Good",
        size: "M",
        tags: ["vintage"],
        status: "removed",
      },
    ],
  });
  try {
    const result = await request(app).get("/search").query({
      q: "Acme",
      category: "shoes",
      style: "vintage",
      brand: "Acme",
      size: "M",
      condition: "Good",
      minPrice: 500,
      maxPrice: 1500,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body.items.map((p) => p.id),
      [rows[0].id],
    );
    assert.equal(
      (await request(app).get("/search").query({ minPrice: -1 })).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .get("/search")
          .query({ minPrice: 1500, maxPrice: 500 })
      ).status,
      400,
    );
    const categoryOnly = await request(app)
      .get("/search")
      .query({ category: prefix });
    assert.equal(categoryOnly.status, 200);
    assert.deepEqual(
      categoryOnly.body.items.map((item) => item.id).sort(),
      [rows[4].id, rows[5].id].sort(),
    );
    const noFilters = await request(app).get("/search").query({});
    assert.equal(noFilters.status, 200);
    assert.ok(
      !noFilters.body.items.some(
        (item) => item.id === rows[2].id || item.id === rows[3].id,
      ),
    );
    const pageOne = await request(app)
      .get("/search")
      .query({ category: prefix, page: 1, limit: 1 });
    const pageTwo = await request(app)
      .get("/search")
      .query({ category: prefix, page: 2, limit: 1 });
    assert.equal(pageOne.status, 200);
    assert.equal(pageTwo.status, 200);
    assert.equal(pageOne.body.totalPages, 2);
    assert.equal(pageTwo.body.items.length, 1);

    const adminToken = signAccessToken({ sub: "catalog-admin", role: "ADMIN" });
    const adminAll = await request(app)
      .get("/admin/search")
      .query({ category: prefix })
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(adminAll.status, 200);
    assert.ok(adminAll.body.items.some((item) => item.id === rows[2].id));
    assert.ok(!adminAll.body.items.some((item) => item.id === rows[6].id));
    const adminExplicit = await request(app)
      .get("/admin/search")
      .query({ category: prefix, status: "removed" })
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(adminExplicit.status, 200);
    assert.deepEqual(
      adminExplicit.body.items.map((item) => item.id),
      [rows[6].id],
    );
  } finally {
    await prisma.product.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
  }
});
