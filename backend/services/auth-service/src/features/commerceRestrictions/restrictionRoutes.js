const { Router } = require("express");
const { requireAuth, requirePermission } = require("@reloop/shared");
const service = require("./restrictionService");

const router = Router();

router.get("/me/commerce-restriction", requireAuth, async (req, res, next) => {
  try {
    res.json(await service.getForUser(req.userId));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/admin/users/:id/commerce-restriction",
  requireAuth,
  requirePermission("admin:user:suspend"),
  async (req, res, next) => {
    try {
      res.json(
        await service.restrict({
          targetId: req.params.id,
          actorId: req.userId,
          scope: req.body.scope,
          reason: req.body.reason,
          requestId: req.id,
        }),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/admin/users/:id/commerce-restriction/revoke",
  requireAuth,
  requirePermission("admin:user:suspend"),
  async (req, res, next) => {
    try {
      res.json(
        await service.revoke({
          targetId: req.params.id,
          actorId: req.userId,
          scope: req.body.scope || "ALL_COMMERCE",
          reason: req.body.reason,
          requestId: req.id,
        }),
      );
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
