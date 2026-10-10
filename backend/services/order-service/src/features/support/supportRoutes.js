const { Router } = require("express");
const {
  requireAuth,
  requirePermission,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const supportService = require("./supportService");
const auditService = require("./auditService");

const router = Router();

router.get("/search", requireAuth, async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query, 20);
    const { items, total } = await supportService.search({
      role: req.userRole,
      orderId: req.query.orderId,
      buyerId: req.query.buyerId,
      sellerId: req.query.sellerId,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
});

router.get("/users/:id/history", requireAuth, async (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  try {
    const pagination = parsePagination(req.query, 20);
    const { items, total, summary } = await supportService.getUserHistory({
      role: req.userRole,
      userId: req.params.id,
      relationRole: req.query.role || "all",
      skip: pagination.skip,
      take: pagination.take,
    });
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    res.set("Server-Timing", `order-history;dur=${durationMs.toFixed(1)}`);
    res.json({
      ...paginatedResponse(items, total, pagination),
      summary,
      durationMs: Number(durationMs.toFixed(1)),
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/audit",
  requireAuth,
  requirePermission("admin:audit:read"),
  async (req, res, next) => {
    try {
      const pagination = parsePagination(req.query, 20);
      const { items, total } = await auditService.queryAudit({
        kind: req.query.kind || "holds",
        page: pagination.page,
        limit: pagination.limit,
        actorId: req.query.actorId,
        action: req.query.action,
        targetId: req.query.targetId,
        caseId: req.query.caseId,
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
