const prisma = require("../../models/prismaClient");

/**
 * Database access for the ProductVideo feature.
 *
 * Keeping Prisma queries in this file makes the request flow easy to follow:
 * route -> controller -> service -> repository -> PostgreSQL.
 */
function createProductVideoRepository(prismaClient) {
  async function listAvailable({ skip, take }) {
    const where = {
      product: { status: "available", moderatedAt: null },
    };

    const [items, total] = await Promise.all([
      prismaClient.productVideo.findMany({
        where,
        include: { product: { include: { photos: true } } },
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
      select: { id: true, sellerId: true, status: true, moderatedAt: true },
    });
  }

  function findById(id) {
    return prismaClient.productVideo.findUnique({
      where: { id },
      include: {
        product: { select: { status: true, moderatedAt: true } },
      },
    });
  }

  function create(data) {
    return prismaClient.productVideo.create({
      data,
      include: { product: true },
    });
  }

  function upsertChoice({ productVideoId, userId }) {
    return prismaClient.swipeChoice.upsert({
      where: { productVideoId_userId: { productVideoId, userId } },
      update: {},
      create: { productVideoId, userId },
    });
  }

  function deleteChoice({ productVideoId, userId }) {
    return prismaClient.swipeChoice.deleteMany({
      where: { productVideoId, userId },
    });
  }

  return {
    listAvailable,
    findProductOwner,
    findById,
    create,
    upsertChoice,
    deleteChoice,
  };
}

module.exports = createProductVideoRepository(prisma);
module.exports.createProductVideoRepository = createProductVideoRepository;
