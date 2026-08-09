// Integration test against a real, disposable Postgres database (reloop_product).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const TEST_TITLE_PREFIX = "mock-trade-integration-test ";
const sellerToken = signAccessToken({ sub: "int-test-seller", role: "SELLER" });

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("product CRUD against a real database", async (t) => {
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

  const title = `${TEST_TITLE_PREFIX}${Date.now()}`;

  try {
    const createRes = await request(app)
      .post("/")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        title,
        price: 199,
        category: "เสื้อผ้า",
        condition: "Like New",
        tags: ["Vintage", "vintage", "  denim "],
        media: [
          { url: "https://example.test/a.jpg", type: "image" },
          { url: "https://example.test/b.mp4", type: "video" },
        ],
      });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.sellerId, "int-test-seller");
    assert.equal(createRes.body.status, "available");
    assert.equal(createRes.body.condition, "Like New");
    assert.deepEqual(createRes.body.tags, ["vintage", "denim"]);
    assert.deepEqual(createRes.body.media, [
      { url: "https://example.test/a.jpg", type: "image" },
      { url: "https://example.test/b.mp4", type: "video" },
    ]);

    const id = createRes.body.id;

    const categoriesRes = await request(app).get("/categories");
    assert.equal(categoriesRes.status, 200);
    assert.ok(categoriesRes.body.items.includes("เสื้อผ้า"));

    const conditionsRes = await request(app).get("/conditions");
    assert.equal(conditionsRes.status, 200);
    assert.ok(conditionsRes.body.items.some((c) => c.value === "Like New"));

    const getRes = await request(app).get(`/${id}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.title, title);

    const feedRes = await request(app).get("/feed");
    assert.equal(feedRes.status, 200);
    assert.ok(feedRes.body.items.some((p) => p.id === id));

    const searchRes = await request(app)
      .get("/search")
      .query({ q: TEST_TITLE_PREFIX.trim() });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.items.some((p) => p.id === id));

    const missingRes = await request(app).get("/does-not-exist");
    assert.equal(missingRes.status, 404);

    const otherSellerToken = signAccessToken({
      sub: "int-test-other-seller",
      role: "SELLER",
    });
    const forbiddenClipRes = await request(app)
      .post("/videos")
      .set("Authorization", `Bearer ${otherSellerToken}`)
      .send({ videoUrl: "https://example.test/clip.mp4", productId: id });
    assert.equal(forbiddenClipRes.status, 403);

    const clipRes = await request(app)
      .post("/videos")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        videoUrl: "https://example.test/clip.mp4",
        description: "รีวิวจริง",
        productId: id,
        sellerName: "int-test-seller",
      });
    assert.equal(clipRes.status, 201);
    assert.equal(clipRes.body.productId, id);

    const feedVideosRes = await request(app).get("/videos/feed");
    assert.equal(feedVideosRes.status, 200);
    assert.ok(feedVideosRes.body.items.some((v) => v.id === clipRes.body.id));
  } finally {
    await prisma.product.deleteMany({
      where: { title: { startsWith: TEST_TITLE_PREFIX } },
    });
    await prisma.$disconnect();
  }
});
