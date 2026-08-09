const { randomUUID } = require("node:crypto");
const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const RESERVATION_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SWEEP_INTERVAL_MS = 30 * 1000;

const RESERVATION_SELECT = {
  id: true,
  sellerId: true,
  title: true,
  price: true,
  status: true,
  reservationId: true,
  reservedBy: true,
  reservationExpiresAt: true,
};

function isActiveReservation(product, buyerId, now) {
  return (
    product.status === "reserved" &&
    product.reservedBy === buyerId &&
    product.reservationId &&
    product.reservationExpiresAt &&
    product.reservationExpiresAt > now
  );
}

function toReservationResponse(product, created) {
  return {
    created,
    reservationId: product.reservationId,
    expiresAt: product.reservationExpiresAt,
    product: {
      id: product.id,
      sellerId: product.sellerId,
      title: product.title,
      price: product.price,
    },
  };
}

async function reserveProduct(
  productId,
  buyerId,
  { now = new Date(), reservationId = randomUUID() } = {},
) {
  if (!buyerId) throw badRequest("buyerId is required");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: RESERVATION_SELECT,
  });
  if (!product) throw notFound("product not found");
  if (product.sellerId === buyerId) {
    throw badRequest("you cannot buy your own listing");
  }
  if (isActiveReservation(product, buyerId, now)) {
    return toReservationResponse(product, false);
  }

  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
  const claimed = await prisma.product.updateMany({
    where: {
      id: productId,
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
      reservationId,
      reservedBy: buyerId,
      reservationExpiresAt: expiresAt,
    },
  });

  const current = await prisma.product.findUnique({
    where: { id: productId },
    select: RESERVATION_SELECT,
  });
  if (!current) throw notFound("product not found");
  if (claimed.count === 1) return toReservationResponse(current, true);
  if (isActiveReservation(current, buyerId, now)) {
    return toReservationResponse(current, false);
  }
  throw conflict("product is already reserved or unavailable");
}

async function releaseProductReservation(productId, reservationId) {
  const released = await prisma.product.updateMany({
    where: {
      id: productId,
      status: "reserved",
      reservationId,
    },
    data: {
      status: "available",
      reservationId: null,
      reservedBy: null,
      reservationExpiresAt: null,
    },
  });
  return released.count === 1;
}

async function completeProductReservation(
  productId,
  reservationId,
  { now = new Date() } = {},
) {
  const completed = await prisma.product.updateMany({
    where: {
      id: productId,
      status: "reserved",
      reservationId,
      reservationExpiresAt: { gt: now },
    },
    data: {
      status: "sold",
      reservationId: null,
      reservedBy: null,
      reservationExpiresAt: null,
    },
  });
  if (completed.count !== 1) {
    throw conflict("reservation has expired or is no longer active");
  }
}

async function releaseExpiredReservations({ now = new Date() } = {}) {
  const released = await prisma.product.updateMany({
    where: {
      status: "reserved",
      reservationExpiresAt: { lte: now },
    },
    data: {
      status: "available",
      reservationId: null,
      reservedBy: null,
      reservationExpiresAt: null,
    },
  });
  return released.count;
}

function startReservationExpiryWorker() {
  const sweep = () => {
    releaseExpiredReservations().catch((error) => {
      console.error("[product-service] reservation expiry sweep failed", error);
    });
  };
  sweep();
  const timer = setInterval(sweep, EXPIRY_SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = {
  RESERVATION_TTL_MS,
  reserveProduct,
  releaseProductReservation,
  completeProductReservation,
  releaseExpiredReservations,
  startReservationExpiryWorker,
};
