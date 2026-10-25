const { Router } = require("express");
const { requireAuth, requireCustomerAccount } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

function createRecommendationHistoryRoutes(db = prisma) {
  const router = Router();
  router.get(
    "/",
    requireAuth,
    requireCustomerAccount,
    async (req, res, next) => {
      try {
        const since = new Date(Date.now() - 180 * 86400000);
        const rows = await db.order.findMany({
          where: {
            buyerId: req.userId,
            status: {
              in: [
                "paid",
                "confirmed",
                "ready_to_ship",
                "pickup_in_progress",
                "in_transit",
                "delivered",
                "completed",
              ],
            },
            payments: {
              some: { paymentStatus: "paid", paidAt: { gte: since } },
            },
          },
          select: {
            productId: true,
            payments: {
              where: { paymentStatus: "paid", paidAt: { gte: since } },
              select: { paidAt: true },
              orderBy: { paidAt: "desc" },
              take: 1,
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 50,
        });
        res.set("Cache-Control", "private, no-store");
        res.json({
          items: rows.map((row) => ({
            productId: row.productId,
            purchasedAt: row.payments[0].paidAt,
          })),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
module.exports = createRecommendationHistoryRoutes();
module.exports.createRecommendationHistoryRoutes =
  createRecommendationHistoryRoutes;
