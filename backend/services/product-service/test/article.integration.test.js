const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const buyerToken = signAccessToken({
  sub: "int-test-buyer",
  role: "BUYER",
  displayName: "Buyer Test",
});

const marketingToken = signAccessToken({
  sub: "int-test-marketing",
  role: "MARKETING",
  displayName: "ฝ่ายการตลาด ทดสอบ",
});

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("articles API permissions, search, and CRUD", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  // 1. Guest can browse published articles
  const listRes = await request(app).get("/articles");
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.items));

  // 2. BUYER cannot create an article (403 Forbidden)
  const forbiddenRes = await request(app)
    .post("/articles")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({
      title: "บทความผู้ซื้อไม่ควรสร้างได้",
      content: "เนื้อหาทดสอบ",
    });
  assert.equal(forbiddenRes.status, 403);

  // 3. MARKETING can create an article
  const uniqueTitle = `เคล็ดลับการซักผ้าวินเทจ ${Date.now()}`;
  const createRes = await request(app)
    .post("/articles")
    .set("Authorization", `Bearer ${marketingToken}`)
    .send({
      title: uniqueTitle,
      summary: "สรุปเคล็ดลับการดูแลผ้า",
      content: "เนื้อหาแบบละเอียดสำหรับบทความทดสอบ",
      category: "care",
      status: "published",
    });
  assert.equal(createRes.status, 201);
  const created = createRes.body.article;
  assert.equal(created.title, uniqueTitle);
  assert.equal(created.category, "care");
  assert.equal(created.status, "published");

  // 4. Search finds the newly created article by Thai keyword
  const searchRes = await request(app)
    .get(`/articles?q=${encodeURIComponent("ซักผ้าวินเทจ")}`);
  assert.equal(searchRes.status, 200);
  const found = searchRes.body.items.some((item) => item.id === created.id);
  assert.ok(found, "Search should find newly created article using trigram search");

  // 5. MARKETING can update article
  const updateRes = await request(app)
    .put(`/articles/${created.id}`)
    .set("Authorization", `Bearer ${marketingToken}`)
    .send({
      title: `${uniqueTitle} (แก้ไขแล้ว)`,
      category: "styling",
    });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.article.category, "styling");

  // 6. MARKETING can delete article
  const deleteRes = await request(app)
    .delete(`/articles/${created.id}`)
    .set("Authorization", `Bearer ${marketingToken}`);
  assert.equal(deleteRes.status, 204);

  // 7. Verify deletion
  const getAfterDelete = await request(app).get(`/articles/${created.id}`);
  assert.equal(getAfterDelete.status, 404);
});
