const test = require("node:test");
const assert = require("node:assert/strict");

if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const prisma = require("../src/models/prismaClient");
const articleModel = require("../src/models/articleModel");

const baseUrl = process.env.PRODUCT_TEST_URL || "http://localhost:3002";

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("article reads use a real database and remain unique per guest session", async (t) => {
  const title = `Article view integration ${Date.now()}`;
  const article = await prisma.article.create({
    data: {
      title,
      content: "Integration test content",
      category: "general",
      status: "published",
      authorId: "integration-marketing",
      authorName: "Integration Marketing",
      searchText: title,
      publishedAt: new Date(),
    },
  });
  t.after(async () => {
    await prisma.article.deleteMany({ where: { id: article.id } });
    await prisma.$disconnect();
  });

  const guestSessionId = `guest-integration-${Date.now()}`;
  const started = await post(`/articles/${article.id}/views/start`, {
    guestSessionId,
  });
  assert.equal(started.status, 200);
  assert.equal(started.body.alreadyCounted, false);

  const tooEarly = await post(`/articles/${article.id}/views/complete`, {
    guestSessionId,
  });
  assert.equal(tooEarly.status, 400);
  assert.equal(tooEarly.body.code, "ARTICLE_VIEW_DWELL_REQUIRED");

  await prisma.articleView.updateMany({
    where: { articleId: article.id, guestSessionId },
    data: { startedAt: new Date(Date.now() - 21_000) },
  });
  const completed = await post(`/articles/${article.id}/views/complete`, {
    guestSessionId,
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.counted, true);
  assert.equal(completed.body.viewCount, 1);

  const repeated = await post(`/articles/${article.id}/views/complete`, {
    guestSessionId,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.counted, false);
  assert.equal(repeated.body.viewCount, 1);

  const detailResponse = await fetch(`${baseUrl}/articles/${article.id}`);
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.article.viewCount, 1);

  const marketingList = await articleModel.listAllForMarketing({
    q: title,
    take: 5,
  });
  assert.equal(
    marketingList.items.find((item) => item.id === article.id)?.viewCount,
    1,
  );
});
