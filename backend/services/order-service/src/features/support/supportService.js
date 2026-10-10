const { badRequest, forbidden } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const AGENT_ROLES = new Set(["CUSTOMER_SERVICE", "ADMIN", "TRUST_AND_SAFETY"]);

/**
 * CSS-002 (UR-17 / FR-4.1.1): bounded order lookup for support agents.
 *
 * Deliberately narrower than the plan's original "search by customer name or
 * code" — order-service only holds opaque buyerId/sellerId, not
 * name/email (those live in auth-service, and there's no established
 * cross-service join pattern in this repo yet). Search is therefore by
 * orderId, buyerId or sellerId; an agent already has these from the
 * support ticket they're working (SupportTicket.orderId) or from asking the
 * user for their order id.
 *
 * A search with no filter is rejected — allowing one would let an agent dump
 * the entire orders table one page at a time.
 */
async function search({
  role,
  orderId,
  buyerId,
  sellerId,
  skip = 0,
  take = 20,
}) {
  if (!AGENT_ROLES.has(role)) {
    throw forbidden("only support agents can look up orders");
  }
  if (!orderId && !buyerId && !sellerId) {
    throw badRequest("provide at least one of orderId, buyerId or sellerId");
  }

  const where = {
    ...(orderId ? { id: orderId } : {}),
    ...(buyerId ? { buyerId } : {}),
    ...(sellerId ? { sellerId } : {}),
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

const HISTORY_ROLES = new Set(["buyer", "seller", "all"]);

function historyWhere(userId, relationRole) {
  if (relationRole === "buyer") return { buyerId: userId };
  if (relationRole === "seller") return { sellerId: userId };
  return { OR: [{ buyerId: userId }, { sellerId: userId }] };
}

/**
 * TSR-07: order-service owns both the paged history and its aggregate counts.
 * Consumers must not join or count an arbitrary first page themselves.
 */
async function getUserHistory({
  role,
  userId,
  relationRole = "all",
  skip = 0,
  take = 20,
}) {
  if (!AGENT_ROLES.has(role)) {
    throw forbidden("only support agents can look up order history");
  }
  if (!userId?.trim()) throw badRequest("userId is required");
  if (!HISTORY_ROLES.has(relationRole)) {
    throw badRequest("role must be one of buyer, seller or all");
  }

  const cleanUserId = userId.trim();
  const where = historyWhere(cleanUserId, relationRole);
  const [items, total, buyerOrders, sellerOrders, completedOrders, statuses] =
    await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.order.count({ where }),
      prisma.order.count({ where: { buyerId: cleanUserId } }),
      prisma.order.count({ where: { sellerId: cleanUserId } }),
      prisma.order.count({ where: { ...where, status: "completed" } }),
      prisma.order.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);

  return {
    items,
    total,
    summary: {
      buyerOrders,
      sellerOrders,
      completedOrders,
      completedOrdersMeaning: "order_status_completed",
      byStatus: Object.fromEntries(
        statuses.map((row) => [row.status, row._count._all]),
      ),
      lateShipments: null,
      lateShipmentsAvailable: false,
      packageIssues: null,
      packageIssuesAvailable: false,
    },
  };
}

module.exports = { search, getUserHistory };
