const { notFound } = require("@reloop/shared");

const visibleProduct = {
  moderatedAt: null,
  status: { in: ["available", "reserved", "sold", "auction"] },
};

function createWishlistService(db) {
  async function requireVisible(productId) {
    const product = await db.product.findFirst({
      where: { id: productId, ...visibleProduct },
    });
    if (!product) throw notFound("product not found");
  }

  async function state(userId, productId) {
    const [favorite, count] = await Promise.all([
      db.productFavorite.findUnique({
        where: { userId_productId: { userId, productId } },
      }),
      db.productFavorite.count({ where: { productId } }),
    ]);
    return { saved: Boolean(favorite), count };
  }

  async function read(userId, productId) {
    await requireVisible(productId);
    return state(userId, productId);
  }

  async function save(userId, productId) {
    await requireVisible(productId);
    // A native INSERT ... ON CONFLICT keeps simultaneous saves idempotent.
    await db.productFavorite.createMany({
      data: [{ userId, productId }],
      skipDuplicates: true,
    });
    return state(userId, productId);
  }

  async function remove(userId, productId) {
    await db.productFavorite.deleteMany({ where: { userId, productId } });
    return state(userId, productId);
  }

  async function list(userId, { skip, take }) {
    const where = { userId, product: visibleProduct };
    const [items, total] = await Promise.all([
      db.productFavorite.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: "desc" }, { productId: "asc" }],
        include: { product: { include: { photos: true, videos: true } } },
      }),
      db.productFavorite.count({ where }),
    ]);
    return { items: items.map((item) => item.product), total };
  }
  return { read, save, remove, list };
}

module.exports = { createWishlistService };
