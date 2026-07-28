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

function listByBuyer(buyerId) {
  return prisma.order.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
  });
}

function listBySeller(sellerId) {
  return prisma.order.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
  });
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
