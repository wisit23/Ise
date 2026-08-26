const { conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

async function removeProduct(productId, reason) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound("product not found");
  if (product.status === "removed") {
    throw conflict("product has already been removed");
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      preRemovalStatus: product.status,
      status: "removed",
      moderatedAt: new Date(),
      moderationReason: reason,
    },
  });
}

async function restoreProduct(productId) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound("product not found");
  if (product.status !== "removed") {
    throw conflict("product is not currently removed");
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      status: product.preRemovalStatus || "available",
      preRemovalStatus: null,
      moderatedAt: null,
      moderationReason: null,
    },
  });
}

module.exports = { removeProduct, restoreProduct };
