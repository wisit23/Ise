const { badRequest, forbidden } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const AGENT_ROLES = new Set(["SUPPORT", "ADMIN"]);

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

module.exports = { search };
