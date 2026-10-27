const { notFound } = require("@reloop/shared");

const visibleProduct = {
  deletedAt: null,
  moderatedAt: null,
  status: { in: ["available", "reserved", "sold", "auction"] },
};

function createWishlistService(db) {
  async function requireVisible(productId) {
    const product = await db.product.findFirst({
      where: { deletedAt: null, id: productId, ...visibleProduct },
    });
    if (!product) throw notFound("product not found");
  }

  async function state(userId, productId) {
    const [favorite, count] = await Promise.all([
      db.productFavorite.findUnique({
        where: {
          userId_productId: { userId, productId },
          deletedAt: null,
          product: { deletedAt: null },
        },
      }),
      db.productFavorite.count({
        where: { productId, deletedAt: null, product: { deletedAt: null } },
      }),
    ]);
    return { saved: Boolean(favorite), count };
  }

  async function read(userId, productId) {
    await requireVisible(productId);
    return state(userId, productId);
  }

  async function save(userId, productId) {
    await requireVisible(productId);
    // Reuse the unique membership so saving again restores a removed favorite.
    await db.productFavorite.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: { deletedAt: null },
    });
    return state(userId, productId);
  }

  async function remove(userId, productId) {
    await db.productFavorite.updateMany({
      where: { userId, productId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return state(userId, productId);
  }

  async function list(userId, { skip, take }) {
    const where = { userId, deletedAt: null, product: visibleProduct };
    const [items, total] = await Promise.all([
      db.productFavorite.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: "desc" }, { productId: "asc" }],
        include: {
          product: {
            include: {
              photos: { where: { deletedAt: null } },
              videos: { where: { deletedAt: null } },
            },
          },
        },
      }),
      db.productFavorite.count({ where }),
    ]);
    return { items: items.map((item) => item.product), total };
  }
  return { read, save, remove, list };
}

module.exports = { createWishlistService };
