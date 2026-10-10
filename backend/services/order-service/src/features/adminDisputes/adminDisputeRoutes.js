const { Router } = require("express");
const { requireAuth, requirePermission } = require("@reloop/shared");
const adminDisputeService = require("./adminDisputeService");
const prisma = require("../../models/prismaClient");

const router = Router();

router.get(
  "/admin/dashboard-summary",
  requireAuth,
  requirePermission("admin:dispute:hold"),
  async (req, res, next) => {
    try {
      const [disputes, activeTrustSafetyHolds] = await Promise.all([
        prisma.disputeCase.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.orderHold.count({
          where: { source: "TRUST_AND_SAFETY", releasedAt: null },
        }),
      ]);
      res.json({
        disputesByStatus: Object.fromEntries(
          disputes.map((row) => [row.status, row._count._all]),
        ),
        activeTrustSafetyHolds,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/admin/:id",
  requireAuth,
  requirePermission("admin:dispute:hold"),
  async (req, res, next) => {
    try {
      const view = await adminDisputeService.getDisputeView({
        orderId: req.params.id,
        adminId: req.userId,
      });
      res.json(view);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/:id/hold",
  requireAuth,
  requirePermission("admin:dispute:hold"),
  async (req, res, next) => {
    try {
      const order = await adminDisputeService.holdSimulatedFunds({
        orderId: req.params.id,
        reason: req.body.reason,
        version: req.body.version,
        adminId: req.userId,
        staffId: req.userId,
      });
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/:id/release",
  requireAuth,
  requirePermission("admin:dispute:release"),
  async (req, res, next) => {
    try {
      const order = await adminDisputeService.releaseSimulatedFunds({
        orderId: req.params.id,
        reason: req.body.reason,
        version: req.body.version,
        adminId: req.userId,
        staffId: req.userId,
      });
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
