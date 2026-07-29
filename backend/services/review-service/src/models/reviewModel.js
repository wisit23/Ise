const prisma = require("./prismaClient");

function create(data) {
  return prisma.review.create({ data });
}

function findByOrderId(orderId) {
  return prisma.review.findUnique({ where: { orderId } });
}

async function listBySeller(sellerId, { skip, take } = {}) {
  const where = { sellerId };
  const [items, total, aggregate] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({ where, _avg: { rating: true } }),
  ]);
  return {
    items,
    total,
    averageRating: aggregate._avg.rating || 0,
  };
}

/** Cheap summary for cards/lists that only need the number, not the review list itself. */
async function summaryBySeller(sellerId) {
  const [total, aggregate] = await Promise.all([
    prisma.review.count({ where: { sellerId } }),
    prisma.review.aggregate({
      where: { sellerId },
      _avg: { rating: true },
    }),
  ]);
  return { total, averageRating: aggregate._avg.rating || 0 };
}

async function listByBuyer(buyerId, { skip, take } = {}) {
  const where = { buyerId };
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.review.count({ where }),
  ]);
  return { items, total };
}

module.exports = {
  create,
  findByOrderId,
  listBySeller,
  summaryBySeller,
  listByBuyer,
};
