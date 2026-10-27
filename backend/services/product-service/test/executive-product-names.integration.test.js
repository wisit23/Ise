// Integration test against a real, disposable Postgres database (reloop_product).
// Skips cleanly when DATABASE_URL is unset/unreachable; set REQUIRE_INTEGRATION=1
// to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "product-names-internal-token";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive product names against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = Date.now();
  const sellerId = `mock-exec-names-seller-${runId}`;
  const condition = `exec-names-condition-${runId}`;
  const make = (key, extra) => ({
    id: `exec-names-${key}-${runId}`,
    sellerId,
    title: `สินค้า ${key}`,
    price: 100,
    category: "test",
    condition,
    ...extra,
  });
  const products = {
    available: make("available", { status: "available" }),
    sold: make("sold", { status: "sold" }),
    deleted: make("deleted", { deletedAt: new Date() }),
  };
  const ids = Object.values(products).map((product) => product.id);

  const ask = (body, token = process.env.INTERNAL_SERVICE_TOKEN) =>
    request(app)
      .post("/internal/executive/product-names")
      .set("x-internal-token", token)
      .send(body);

  try {
    await prisma.condition.create({ data: { value: condition, label: "Test condition" } });
    await prisma.product.createMany({ data: Object.values(products) });

    const res = await ask({ ids: [...ids, `exec-names-never-${runId}`] });
    assert.equal(res.status, 200);
    const byId = new Map(res.body.data.map((row) => [row.id, row]));

    // A product that was sold keeps its row and its name.
    assert.deepEqual(byId.get(products.sold.id), {
      id: products.sold.id,
      title: "สินค้า sold",
      deleted: false,
    });
    assert.equal(byId.get(products.available.id).deleted, false);
    // One its seller deleted is only marked deleted: its name is still here.
    assert.deepEqual(byId.get(products.deleted.id), {
      id: products.deleted.id,
      title: "สินค้า deleted",
      deleted: true,
    });
    // An id that was never a product is simply absent.
    assert.equal(byId.has(`exec-names-never-${runId}`), false);
    assert.equal(res.body.data.length, 3);

    // The same id twice is answered once.
    const twice = await ask({ ids: [products.sold.id, products.sold.id] });
    assert.equal(twice.body.data.length, 1);

    // Nothing asked, nothing answered.
    assert.deepEqual((await ask({ ids: [] })).body.data, []);

    // A bad request, and a caller without the service token, are refused.
    for (const bad of [
      {},
      { ids: "p1" },
      { ids: [1] },
      { ids: [""] },
      { ids: ["x".repeat(129)] },
      { ids: Array.from({ length: 101 }, (_, i) => `p${i}`) },
    ]) {
      assert.equal((await ask(bad)).status, 400, JSON.stringify(bad).slice(0, 40));
    }
    assert.equal((await ask({ ids }, "wrong-token")).status, 403);
    assert.equal(
      (await request(app).post("/internal/executive/product-names").send({ ids }))
        .status,
      403,
    );
  } finally {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.condition.deleteMany({ where: { value: condition } });
    await prisma.$disconnect();
  }
});
