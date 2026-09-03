const { Router } = require("express");
const { requireAuth, requirePermission } = require("@reloop/shared");
const productModerationService = require("./productModerationService");

const router = Router();

router.post(
  "/admin/products/:id/remove",
  requireAuth,
  requirePermission("admin:moderation:remove"),
  async (req, res, next) => {
    try {
      const product = await productModerationService.removeProduct({
        productId: req.params.id,
        adminId: req.userId,
        reason: req.body.reason,
        requestId: req.id,
      });
      res.json(product);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/products/:id/restore",
  requireAuth,
  requirePermission("admin:moderation:remove"),
  async (req, res, next) => {
    try {
      const product = await productModerationService.restoreProduct({
        productId: req.params.id,
        adminId: req.userId,
        requestId: req.id,
      });
      res.json(product);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
