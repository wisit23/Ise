const { Router } = require("express");
const { requireAuth, requirePermission } = require("@reloop/shared");
const adminDisputeService = require("./adminDisputeService");

const router = Router();

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
      });
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
