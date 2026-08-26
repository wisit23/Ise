const { randomUUID } = require("node:crypto");
const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const RESERVATION_DURATION_MS = 10 * 60 * 1000;

function reservationResult(product) {
  return {
    reservationId: product.reservationId,
    reservedBy: product.reservedBy,
    expiresAt: product.reservationExpiresAt,
    product: {
      id: product.id,
      sellerId: product.sellerId,
      title: product.title,
      price: product.price,
      status: product.status,
    },
  };
}

async function reserve({ productId, buyerId, now = new Date() }) {
  if (!buyerId) throw badRequest("buyerId is required");

  const reservationId = randomUUID();
  const expiresAt = new Date(now.getTime() + RESERVATION_DURATION_MS);

  const updated = await prisma.product.updateMany({
    where: {
      id: productId,
      sellerId: { not: buyerId },
      OR: [
        { status: "available" },
        {
          status: "reserved",
          reservationExpiresAt: { lte: now },
        },
      ],
    },
    data: {
      status: "reserved",
      reservedBy: buyerId,
      reservationId,
      reservationExpiresAt: expiresAt,
    },
  });

  if (updated.count !== 1) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw notFound("product not found");
    if (product.sellerId === buyerId) {
      throw badRequest("you cannot reserve your own listing");
    }
    throw conflict("product is already reserved or unavailable");
  }

  const product = await prisma.product.findFirstOrThrow({
    where: { id: productId, reservationId },
  });
  return reservationResult(product);
}

async function release({ productId, reservationId, buyerId }) {
  const updated = await prisma.product.updateMany({
    where: {
      id: productId,
      status: "reserved",
      reservationId,
      ...(buyerId ? { reservedBy: buyerId } : {}),
    },
    data: {
      status: "available",
      reservedBy: null,
      reservationId: null,
      reservationExpiresAt: null,
    },
  });
  if (updated.count !== 1) {
    throw conflict("reservation is no longer active");
  }
}

async function confirm({
  productId,
  reservationId,
  buyerId,
  now = new Date(),
}) {
  const updated = await prisma.product.updateMany({
    where: {
      id: productId,
      status: "reserved",
      reservationId,
      reservedBy: buyerId,
      reservationExpiresAt: { gt: now },
    },
    data: { status: "sold" },
  });
  if (updated.count !== 1) {
    throw conflict("reservation is expired or no longer active");
  }
}

async function cleanupExpired({ now = new Date() } = {}) {
  const result = await prisma.product.updateMany({
    where: {
      status: "reserved",
      reservationExpiresAt: { lte: now },
    },
    data: {
      status: "available",
      reservedBy: null,
      reservationId: null,
      reservationExpiresAt: null,
    },
  });
  return result.count;
}

module.exports = {
  RESERVATION_DURATION_MS,
  reserve,
  release,
  confirm,
  cleanupExpired,
};
