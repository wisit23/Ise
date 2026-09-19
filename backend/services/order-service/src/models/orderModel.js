const { conflict } = require("@reloop/shared");
const prisma = require("./prismaClient");

const VALID_STATUSES = [
  "pending",
  "pending_payment",
  "confirmed",
  "shipped",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
];

function create(data) {
  return prisma.order.create({ data });
}

function findById(id) {
  return prisma.order.findUnique({ where: { id } });
}

function findByReservationId(reservationId) {
  return prisma.order.findUnique({ where: { reservationId } });
}

function statusFilter(status) {
  if (status === "pending_payment") {
    return { in: ["pending", "pending_payment"] };
  }
  return status;
}

async function listByBuyer(buyerId, { status, skip, take } = {}) {
  const where = {
    buyerId,
    ...(status ? { status: statusFilter(status) } : {}),
    ...(status === "pending_payment"
      ? { reservationExpiresAt: { gt: new Date() } }
      : {}),
  };
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
  const where = {
    sellerId,
    ...(status ? { status: statusFilter(status) } : {}),
  };
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

async function updateStatus(id, status, expectedVersion) {
  try {
    const where = { id };
    if (typeof expectedVersion === "number") {
      where.version = expectedVersion;
    }
    const { count } = await prisma.order.updateMany({
      where,
      data: {
        status,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      if (typeof expectedVersion === "number") {
        throw conflict("order was modified concurrently — reload and retry");
      }
      return null;
    }
    return prisma.order.findUnique({ where: { id } });
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
}

/**
 * Commits an Order status transition and its product-service side effect as a
 * single local transaction. Delivery is handled by productSyncService, so a
 * temporary product-service failure cannot lose the required state change.
 */
async function transitionStatusWithProductSync({
  id,
  status,
  expectedVersion,
  expectedStatuses,
  productSync,
}) {
  return prisma.$transaction(async (tx) => {
    const where = { id, version: expectedVersion };
    if (expectedStatuses) where.status = { in: expectedStatuses };

    const { count } = await tx.order.updateMany({
      where,
      data: {
        status,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw conflict("order was modified concurrently — reload and retry");
    }

    const event = await tx.productSyncEvent.create({
      data: {
        orderId: id,
        dedupeKey: productSync.dedupeKey,
        action: productSync.action,
        productId: productSync.productId,
        reservationId: productSync.reservationId || null,
        targetStatus: productSync.targetStatus || null,
      },
    });
    const order = await tx.order.findUnique({ where: { id } });
    return { order, event };
  });
}

module.exports = {
  create,
  findById,
  findByReservationId,
  listByBuyer,
  listBySeller,
  updateStatus,
  transitionStatusWithProductSync,
  VALID_STATUSES,
};
