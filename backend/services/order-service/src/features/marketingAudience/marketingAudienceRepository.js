const prisma = require("../../models/prismaClient");

const PAID_ORDER_STATUSES = Object.freeze([
  "paid",
  "confirmed",
  "ready_to_ship",
  "shipped",
  "delivered",
  "completed",
]);

function createMarketingAudienceRepository(db = prisma) {
  async function listPurchases({ from, to, skip, take }) {
    const where = {
      status: { in: PAID_ORDER_STATUSES },
      payments: {
        some: {
          paymentStatus: "paid",
          paidAt: { gte: from, lte: to },
        },
      },
    };
    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
          buyerId: true,
          productId: true,
          payments: {
            where: {
              paymentStatus: "paid",
              paidAt: { gte: from, lte: to },
            },
            select: { paidAt: true },
            orderBy: { paidAt: "desc" },
            take: 1,
          },
        },
      }),
      db.order.count({ where }),
    ]);
    return { orders, total };
  }

  return { listPurchases };
}

module.exports = createMarketingAudienceRepository();
module.exports.createMarketingAudienceRepository =
  createMarketingAudienceRepository;
