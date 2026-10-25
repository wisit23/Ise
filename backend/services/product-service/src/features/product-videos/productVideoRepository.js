const prisma = require("../../models/prismaClient");

/**
 * Database access for the ProductVideo feature.
 *
 * Keeping Prisma queries in this file makes the request flow easy to follow:
 * route -> controller -> service -> repository -> PostgreSQL.
 */
function createProductVideoRepository(prismaClient) {
  async function listMine({ sellerId, skip, take }) {
    const where = {
      deletedAt: null,
      sellerId,
      product: { deletedAt: null, sellerId, status: { not: "sold" } },
    };
    const [items, total] = await Promise.all([
      prismaClient.productVideo.findMany({
        where,
        include: { product: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prismaClient.productVideo.count({ where }),
    ]);
    return { items, total };
  }

  function updateOwned(id, sellerId, data) {
    return prismaClient.productVideo.update({
      where: { id, sellerId, deletedAt: null, product: { deletedAt: null } },
      data,
      include: { product: true },
    });
  }

  function deleteOwned(id, sellerId) {
    return prismaClient.productVideo.update({
      where: { id, sellerId, deletedAt: null, product: { deletedAt: null } },
      data: { deletedAt: new Date() },
    });
  }

  async function listAvailable({ skip, take, userId = null, videoId }) {
    const where = {
      deletedAt: null,
      product: { deletedAt: null, status: "available", moderatedAt: null },
      ...(videoId ? { id: videoId } : {}),
    };

    const [items, total] = await Promise.all([
      prismaClient.productVideo.findMany({
        where,
        include: {
          product: { include: { photos: { where: { deletedAt: null } } } },
          ...(userId
            ? {
                choices: {
                  where: { userId, deletedAt: null },
                  select: { id: true },
                },
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prismaClient.productVideo.count({ where }),
    ]);

    const formattedItems = items.map((clip) => {
      const chosen = Boolean(userId && clip.choices && clip.choices.length > 0);
      const item = { ...clip, chosen };
      delete item.choices;
      return item;
    });

    return { items: formattedItems, total };
  }

  function findProductOwner(productId) {
    return prismaClient.product.findUnique({
      where: { id: productId, deletedAt: null },
      select: { id: true, sellerId: true, status: true, moderatedAt: true },
    });
  }

  function findById(id) {
    return prismaClient.productVideo.findUnique({
      where: { id, deletedAt: null, product: { deletedAt: null } },
      include: {
        product: {
          select: { id: true, status: true, moderatedAt: true, title: true },
        },
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
      update: { deletedAt: null },
      create: { productVideoId, userId },
    });
  }

  function deleteChoice({ productVideoId, userId }) {
    return prismaClient.swipeChoice.updateMany({
      where: { productVideoId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  function createComment({ productVideoId, userId, userName, comment }) {
    return prismaClient.productVideoComment.create({
      data: {
        productVideoId,
        userId,
        userName: userName || null,
        comment,
      },
    });
  }

  function listComments(productVideoId) {
    return prismaClient.productVideoComment.findMany({
      where: { productVideoId },
      orderBy: { createdAt: "desc" },
    });
  }

  return {
    listMine,
    updateOwned,
    deleteOwned,
    listAvailable,
    findProductOwner,
    findById,
    create,
    upsertChoice,
    deleteChoice,
    createComment,
    listComments,
  };
}

module.exports = createProductVideoRepository(prisma);
module.exports.createProductVideoRepository = createProductVideoRepository;
