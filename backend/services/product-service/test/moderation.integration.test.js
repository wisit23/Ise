// Integration test against a real, disposable Postgres database (reloop_product).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const TEST_TITLE_PREFIX = "adm-003-moderation-integration-test ";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("product moderation removes, hides and restores a listing", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/product-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const product = await prisma.product.create({
    data: {
      sellerId: "int-test-seller",
      title: `${TEST_TITLE_PREFIX}available item`,
      price: 500,
      category: "misc",
      status: "available",
    },
  });

  try {
    // Visible before any moderation action.
    const beforeRes = await request(app).get(
      `/search?q=${encodeURIComponent(TEST_TITLE_PREFIX)}`,
    );
    assert.ok(beforeRes.body.items.some((p) => p.id === product.id));

    // No internal token must be rejected before touching state.
    const deniedRes = await request(app)
      .post(`/internal/moderation/${product.id}/remove`)
      .send({ reason: "counterfeit listing" });
    assert.equal(deniedRes.status, 403);

    // Removal must hide the listing from public browsing (search/feed only
    // match status "available") while remembering the prior status for restore.
    const removeRes = await request(app)
      .post(`/internal/moderation/${product.id}/remove`)
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({ reason: "counterfeit listing" });
    assert.equal(removeRes.status, 200);
    assert.equal(removeRes.body.status, "removed");
    assert.equal(removeRes.body.preRemovalStatus, "available");

    const afterRemoveRes = await request(app).get(
      `/search?q=${encodeURIComponent(TEST_TITLE_PREFIX)}`,
    );
    assert.equal(
      afterRemoveRes.body.items.some((p) => p.id === product.id),
      false,
    );

    // Duplicate removal on an already-removed product must conflict.
    const duplicateRes = await request(app)
      .post(`/internal/moderation/${product.id}/remove`)
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({ reason: "counterfeit listing" });
    assert.equal(duplicateRes.status, 409);

    // Restore must put the listing back at its pre-removal status and back
    // into public listings.
    const restoreRes = await request(app)
      .post(`/internal/moderation/${product.id}/restore`)
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({});
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.body.status, "available");
    assert.equal(restoreRes.body.preRemovalStatus, null);

    const afterRestoreRes = await request(app).get(
      `/search?q=${encodeURIComponent(TEST_TITLE_PREFIX)}`,
    );
    assert.ok(afterRestoreRes.body.items.some((p) => p.id === product.id));
  } finally {
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.$disconnect();
  }
});
