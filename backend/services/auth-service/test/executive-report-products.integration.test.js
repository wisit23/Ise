const test = require("node:test");
const assert = require("node:assert/strict");

if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}
const prisma = require("../src/models/prismaClient");
const productNameClient = require("../src/features/metrics/productNameClient");
const {
  getReportOverview,
} = require("../src/features/metrics/executiveReports");

test("a complaint about a product carries the product's name, asked of product-service", async (t) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw error;
    t.skip("requires an isolated Auth PostgreSQL schema");
    await prisma.$disconnect();
    return;
  }

  const runId = Date.now();
  const since = new Date(Date.now() - 1000);
  const users = [];
  const reports = [];
  const realGetNames = productNameClient.getNames;
  t.after(async () => {
    productNameClient.getNames = realGetNames;
    await prisma.report.deleteMany({ where: { id: { in: reports } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  const reporter = await prisma.user.create({
    data: {
      email: `product-reporter-${runId}@ceo-product.test`,
      passwordHash: "fixture",
      firstName: "Reporter",
      lastName: "Tester",
    },
  });
  users.push(reporter.id);

  const make = async (productId) => {
    const row = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetId: null,
        productId,
        reason: `about ${productId ?? "nothing"}`,
        status: "OPEN",
      },
    });
    reports.push(row.id);
    return row.id;
  };
  const ids = {
    named: await make(`p-named-${runId}`),
    sameProduct: await make(`p-named-${runId}`),
    deleted: await make(`p-deleted-${runId}`),
    never: await make(`p-never-${runId}`),
    none: await make(null),
  };

  // One request carries every product; sold and deleted ones are answered,
  // an id that was never a product is not.
  const asked = [];
  productNameClient.getNames = async (productIds) => {
    asked.push(productIds);
    return new Map([
      [`p-named-${runId}`, { title: "กางเกงยีนส์ 36", deleted: false }],
      [`p-deleted-${runId}`, { title: "เสื้อที่ลบแล้ว", deleted: true }],
    ]);
  };

  const { items } = await getReportOverview({
    range: { from: since, to: new Date(Date.now() + 60_000) },
    status: "ALL",
    limit: 100,
  });
  const byId = (id) => items.find((item) => item.id === id);

  // The title for both complaints about the same product, asked of once, in
  // one request with the other products.
  assert.equal(asked.length, 1);
  assert.deepEqual(
    [...asked[0]].sort(),
    [`p-deleted-${runId}`, `p-named-${runId}`, `p-never-${runId}`].sort(),
  );
  assert.equal(byId(ids.named).productTitle, "กางเกงยีนส์ 36");
  assert.equal(byId(ids.sameProduct).productTitle, "กางเกงยีนส์ 36");
  assert.equal(byId(ids.named).productDeleted, undefined);
  assert.equal(byId(ids.named).productUnavailable, undefined);

  // A product its seller deleted keeps its name, flagged.
  assert.equal(byId(ids.deleted).productTitle, "เสื้อที่ลบแล้ว");
  assert.equal(byId(ids.deleted).productDeleted, true);

  // An id that was never a product has no name, and is not "unavailable".
  assert.equal(byId(ids.never).productTitle, null);
  assert.equal(byId(ids.never).productDeleted, undefined);
  assert.equal(byId(ids.never).productUnavailable, undefined);

  // A complaint about no product says nothing about one.
  assert.equal("productTitle" in byId(ids.none), false);

  // product-service cannot be asked: every product is marked unavailable and
  // the complaints are still listed.
  productNameClient.getNames = async () => {
    throw Object.assign(new Error("product-service is unreachable"), {
      status: 502,
    });
  };
  const down = await getReportOverview({
    range: { from: since, to: new Date(Date.now() + 60_000) },
    status: "ALL",
    limit: 100,
  });
  const downNamed = down.items.find((item) => item.id === ids.named);
  assert.equal(downNamed.productTitle, null);
  assert.equal(downNamed.productUnavailable, true);
  assert.equal(down.items.length, items.length);
});
