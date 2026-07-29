const prisma = require("./prismaClient");

function list({ category, q, status } = {}) {
  return prisma.product.findMany({
    where: {
      ...(status ? { status } : { status: { not: "removed" } }),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

function listBySeller(sellerId) {
  return prisma.product.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
  });
}

function findById(id) {
  return prisma.product.findUnique({ where: { id } });
}

function create(data) {
  return prisma.product.create({ data });
}

async function update(id, patch) {
  try {
    return await prisma.product.update({ where: { id }, data: patch });
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
}

async function remove(id) {
  try {
    await prisma.product.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === "P2025") return false;
    throw err;
  }
}

async function getVideoFeed() {
  return await prisma.productVideo.findMany({
    include: {
      product: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}
function createVideo(data) {
  return prisma.productVideo.create({ data });
}

module.exports = { list, listBySeller, findById, create, update, remove , getVideoFeed , createVideo };
