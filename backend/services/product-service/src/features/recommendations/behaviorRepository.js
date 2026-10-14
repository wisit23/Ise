const prisma = require("../../models/prismaClient");
const { badRequest } = require("@reloop/shared");
const { normalizeProfile } = require("./recommendationRules");
const DAY = 86400000;

function recencyWeight(date, weight, now = Date.now()) {
  const age = (now - new Date(date).getTime()) / DAY;
  if (!Number.isFinite(age) || age < -1 || age > 180) return 0;
  return age <= 7 ? weight : age <= 30 ? weight / 2 : weight / 4;
}

function productInterest(product) {
  return normalizeProfile({
    categories: [
      product.category,
      ...(product.categoryLinks || []).map((link) => link.category.name),
    ],
    brands: [product.brand],
    styles: product.tags,
  });
}

function createBehaviorRepository(db = prisma) {
  async function recordSearch(userId, input) {
    if (
      typeof input !== "string" ||
      !input.trim() ||
      input.trim().length > 200 ||
      /\p{Cc}/u.test(input)
    ) {
      throw badRequest("คำค้นต้องเป็นข้อความ 1–200 ตัวอักษร");
    }
    const query = input.trim().toLowerCase();
    await db.$transaction(async (tx) => {
      await tx.recommendationSearch.upsert({
        where: { userId_query: { userId, query } },
        create: { userId, query },
        update: { searchedAt: new Date() },
      });
      const keep = await tx.recommendationSearch.findMany({
        where: { userId, searchedAt: { gte: new Date(Date.now() - 90 * DAY) } },
        orderBy: [{ searchedAt: "desc" }, { query: "asc" }],
        take: 50,
        select: { query: true },
      });
      await tx.recommendationSearch.deleteMany({
        where: { userId, query: { notIn: keep.map((row) => row.query) } },
      });
    });
  }

  async function get(userId) {
    const since = new Date(Date.now() - 90 * DAY);
    const [searches, likes] = await Promise.all([
      db.recommendationSearch.findMany({
        where: { userId, searchedAt: { gte: since } },
        orderBy: { searchedAt: "desc" },
        take: 30,
      }),
      db.swipeChoice.findMany({
        where: {
          userId,
          createdAt: { gte: since },
          productVideo: {
            product: { moderatedAt: null, status: { not: "removed" } },
          },
        },
        include: {
          productVideo: {
            include: {
              product: {
                include: { categoryLinks: { include: { category: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return {
      searches: searches.map((row) => ({
        query: row.query,
        weight: recencyWeight(row.searchedAt, 6),
      })),
      likes: likes.map((row) => ({
        profile: productInterest(row.productVideo.product),
        weight: recencyWeight(row.createdAt, 8),
      })),
    };
  }

  async function purchases(history) {
    const products = history.length
      ? await db.product.findMany({
          where: {
            id: { in: history.map((row) => row.productId) },
            moderatedAt: null,
            status: { not: "removed" },
          },
          include: { categoryLinks: { include: { category: true } } },
        })
      : [];
    const byId = new Map(products.map((product) => [product.id, product]));
    return history
      .filter((row) => byId.has(row.productId))
      .map((row) => ({
        profile: productInterest(byId.get(row.productId)),
        weight: recencyWeight(row.purchasedAt, 10),
      }))
      .filter((row) => row.weight > 0);
  }
  return { recordSearch, get, purchases };
}
module.exports = createBehaviorRepository();
module.exports.createBehaviorRepository = createBehaviorRepository;
module.exports.recencyWeight = recencyWeight;
