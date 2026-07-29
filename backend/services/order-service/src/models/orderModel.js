const prisma = require("./prismaClient");

const VALID_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "completed",
  "cancelled",
];

function create(data) {
  return prisma.order.create({ data });
}

function findById(id) {
  return prisma.order.findUnique({ where: { id } });
}

async function listByBuyer(buyerId, { status, skip, take } = {}) {
  const where = { buyerId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);
  return { items, total };
}

async function listBySeller(sellerId, { status, skip, take } = {}) {
  const where = { sellerId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);
  return { items, total };
}

async function updateStatus(id, status) {
  try {
    return await prisma.order.update({ where: { id }, data: { status } });
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
}

module.exports = {
  create,
  findById,
  listByBuyer,
  listBySeller,
  updateStatus,
  VALID_STATUSES,
};
