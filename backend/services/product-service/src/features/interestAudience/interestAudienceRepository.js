const prisma = require("../../models/prismaClient");
const { normalizeProfile } = require("../recommendations/recommendationRules");

function productInterest(product) {
  return normalizeProfile({
    categories: [
      product.category,
      ...(product.categoryLinks || []).map((link) => link.category.name),
    ],
    brands: [product.brand],
    styles: product.tags,
    sizes:
      product.category && product.size
        ? [{ category: product.category, values: [product.size] }]
        : [],
  });
}

function createInterestAudienceRepository(db = prisma) {
  async function listSearchSignals({ from, to }) {
    return db.recommendationSearch.findMany({
      where: { searchedAt: { gte: from, lte: to } },
      orderBy: [{ userId: "asc" }, { searchedAt: "desc" }],
      select: { userId: true, query: true, searchedAt: true },
    });
  }

  async function listLikeSignals({ from, to }) {
    const rows = await db.swipeChoice.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        productVideo: {
          product: { moderatedAt: null, status: { not: "removed" } },
        },
      },
      orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
      select: {
        userId: true,
        createdAt: true,
        productVideo: {
          select: {
            product: {
              include: {
                categoryLinks: { include: { category: true } },
              },
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      userId: row.userId,
      occurredAt: row.createdAt,
      profile: productInterest(row.productVideo.product),
    }));
  }

  async function hydratePurchaseSignals(purchases) {
    const productIds = [...new Set(purchases.map((row) => row.productId))];
    const products = productIds.length
      ? await db.product.findMany({
          where: {
            id: { in: productIds },
            moderatedAt: null,
            status: { not: "removed" },
          },
          include: { categoryLinks: { include: { category: true } } },
        })
      : [];
    const byId = new Map(products.map((product) => [product.id, product]));
    return purchases
      .filter((row) => byId.has(row.productId))
      .map((row) => ({
        userId: row.userId,
        occurredAt: new Date(row.purchasedAt),
        profile: productInterest(byId.get(row.productId)),
      }));
  }

  async function listDimensions() {
    const [categories, products] = await Promise.all([
      db.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
      db.product.findMany({
        where: { moderatedAt: null, status: { not: "removed" } },
        select: {
          brand: true,
          tags: true,
          size: true,
          category: true,
          categoryLinks: { select: { category: { select: { name: true } } } },
        },
      }),
    ]);
    const unique = (values) =>
      [...new Set(values.map((value) => value?.trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "th"),
      );
    const sizesByCategory = {};
    for (const product of products) {
      if (!product.size) continue;
      const productCategories = unique([
        product.category,
        ...(product.categoryLinks || []).map((link) => link.category.name),
      ]);
      for (const category of productCategories) {
        sizesByCategory[category] = unique([
          ...(sizesByCategory[category] || []),
          product.size,
        ]);
      }
    }
    return {
      categories: unique(categories.map((row) => row.name)),
      brands: unique(products.map((row) => row.brand)),
      styles: unique(products.flatMap((row) => row.tags || [])),
      sizes: unique(products.map((row) => row.size)),
      sizesByCategory,
    };
  }

  async function replaceCampaignAudience(campaignId, rows, { tx } = {}) {
    const client = tx || db;
    await client.campaignAudience.deleteMany({ where: { campaignId } });
    if (rows.length) {
      await client.campaignAudience.createMany({
        data: rows.map((row) => ({
          campaignId,
          userId: row.userId,
          score: row.score,
        })),
        skipDuplicates: true,
      });
    }
  }

  async function isCampaignAudienceMember(campaignId, userId, { tx } = {}) {
    if (!userId) return false;
    const client = tx || db;
    return Boolean(
      await client.campaignAudience.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
        select: { userId: true },
      }),
    );
  }

  async function eligibleCampaignIds(campaignIds, userId) {
    if (!userId || !campaignIds.length) return new Set();
    const rows = await db.campaignAudience.findMany({
      where: { campaignId: { in: campaignIds }, userId },
      select: { campaignId: true },
    });
    return new Set(rows.map((row) => row.campaignId));
  }

  return {
    listSearchSignals,
    listLikeSignals,
    hydratePurchaseSignals,
    listDimensions,
    replaceCampaignAudience,
    isCampaignAudienceMember,
    eligibleCampaignIds,
  };
}

module.exports = createInterestAudienceRepository();
module.exports.createInterestAudienceRepository =
  createInterestAudienceRepository;
module.exports.productInterest = productInterest;
