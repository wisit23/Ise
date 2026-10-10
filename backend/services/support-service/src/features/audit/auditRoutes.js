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
  "/",
  requireAuth,
  requirePermission("admin:audit:read"),
  async (req, res, next) => {
    try {
      const pagination = parsePagination(req.query, 20);
      const { items, total } = await queryAudit({
        page: pagination.page,
        limit: pagination.limit,
        actorId: req.query.actorId,
        action: req.query.action,
        targetId: req.query.targetId,
        operationId: req.query.operationId,
        from: req.query.from,
        to: req.query.to,
      });
      res.json(paginatedResponse(items, total, pagination));
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
