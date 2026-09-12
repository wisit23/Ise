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

function findByAuctionId(auctionId) {
  return prisma.order.findFirst({ where: { auctionId } });
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
      ? {
          OR: [
            { reservationExpiresAt: { gt: new Date() } },
            { auctionId: { not: null } },
            { reservationExpiresAt: null },
          ],
        }
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

async function updateStatus(id, status) {
  try {
    return await prisma.order.update({ where: { id }, data: { status } });
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
}

async function updateCampaign(id, { campaignId, campaignCode, discountAmount, finalPrice }) {
  try {
    return await prisma.order.update({
      where: { id },
      data: {
        campaignId,
        campaignCode,
        discountAmount,
        finalPrice,
      },
    });
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
}

async function cleanExpiredOrders(productClient) {
  try {
    const expired = await prisma.order.findMany({
      where: {
        status: { in: ["pending", "pending_payment"] },
        reservationExpiresAt: { lte: new Date() },
      },
    });

    for (const order of expired) {
      try {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "cancelled" },
        });
        if (order.campaignId && productClient) {
          await productClient.releaseVoucher(order.campaignId, {
            userId: order.buyerId,
            orderId: order.id,
          });
        }
        if (order.productId && order.reservationId && productClient) {
          await productClient.releaseProductReservation(
            order.productId,
            order.reservationId,
          );
        }
      } catch (err) {
        console.warn(`[order-service] cleanExpiredOrder error ${order.id}:`, err.message);
      }
    }
    return expired.length;
  } catch (err) {
    console.warn("[order-service] cleanExpiredOrders query failed:", err.message);
    return 0;
  }
}

module.exports = {
  create,
  findById,
  findByReservationId,
  findByAuctionId,
  listByBuyer,
  listBySeller,
  updateStatus,
  updateCampaign,
  cleanExpiredOrders,
  VALID_STATUSES,
};
