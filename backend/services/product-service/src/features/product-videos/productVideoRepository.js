const prisma = require("../../models/prismaClient");

/**
 * Database access for the ProductVideo feature.
 *
 * Keeping Prisma queries in this file makes the request flow easy to follow:
 * route -> controller -> service -> repository -> PostgreSQL.
 */
function createProductVideoRepository(prismaClient) {
  async function listAvailable({ skip, take }) {
    const where = { product: { status: "available" } };

    const [items, total] = await Promise.all([
      prismaClient.productVideo.findMany({
        where,
        include: { product: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prismaClient.productVideo.count({ where }),
    ]);

    return { items, total };
  }

  function findProductOwner(productId) {
    return prismaClient.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true },
    });
  }

  function create(data) {
    return prismaClient.productVideo.create({
      data,
      include: { product: true },
    });
  }

  return {
    listAvailable,
    findProductOwner,
    create,
  };
}

module.exports = createProductVideoRepository(prisma);
module.exports.createProductVideoRepository = createProductVideoRepository;
