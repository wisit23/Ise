const { Router } = require("express");
const {
  requireAuth,
  requirePermission,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const { queryAudit } = require("./auditQuery");

const router = Router();

router.get(
  "/admin/audit",
  requireAuth,
  requirePermission("admin:audit:read"),
  async (req, res, next) => {
    try {
      const pagination = parsePagination(req.query);
      const { items, total } = await queryAudit({
        ...pagination,
        actorId: req.query.actorId,
        action: req.query.action,
        targetId: req.query.targetId,
      });
      res.json(paginatedResponse(items, total, pagination));
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
