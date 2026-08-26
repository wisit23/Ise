const { Router } = require("express");
const {
  requireAuth,
  requirePermission,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const reportService = require("./reportService");

const router = Router();

router.post(
  "/reports",
  requireAuth,
  requirePermission("report:create"),
  async (req, res, next) => {
    try {
      const report = await reportService.createReport({
        reporterId: req.userId,
        targetId: req.body.targetId,
        productId: req.body.productId,
        reason: req.body.reason,
      });
      res.status(201).json(report);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/admin/reports",
  requireAuth,
  requirePermission("admin:report:read"),
  async (req, res, next) => {
    try {
      const pagination = parsePagination(req.query);
      const { items, total } = await reportService.listReports({
        ...pagination,
        status: req.query.status,
      });
      res.json(paginatedResponse(items, total, pagination));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/reports/:id/review",
  requireAuth,
  requirePermission("admin:report:read"),
  async (req, res, next) => {
    try {
      const report = await reportService.reviewReport({
        reportId: req.params.id,
        adminId: req.userId,
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/reports/:id/action",
  requireAuth,
  requirePermission("admin:report:action"),
  async (req, res, next) => {
    try {
      const report = await reportService.actionReport({
        reportId: req.params.id,
        adminId: req.userId,
        decision: req.body.decision,
        reason: req.body.reason,
        requestId: req.id,
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/users/:id/suspend",
  requireAuth,
  requirePermission("admin:user:suspend"),
  async (req, res, next) => {
    try {
      const user = await reportService.suspendUser({
        targetId: req.params.id,
        adminId: req.userId,
        reason: req.body.reason,
        requestId: req.id,
      });
      res.json(user);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/users/:id/warn",
  requireAuth,
  requirePermission("admin:user:suspend"),
  async (req, res, next) => {
    try {
      const user = await reportService.warnUser({
        targetId: req.params.id,
        adminId: req.userId,
        reason: req.body.reason,
        requestId: req.id,
      });
      res.json(user);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/users/:id/restore",
  requireAuth,
  requirePermission("admin:user:suspend"),
  async (req, res, next) => {
    try {
      const user = await reportService.restoreUser({
        targetId: req.params.id,
        adminId: req.userId,
        reason: req.body.reason,
        requestId: req.id,
      });
      res.json(user);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/admin/users/:id/safety-summary",
  requireAuth,
  requirePermission("admin:report:read"),
  async (req, res, next) => {
    try {
      const summary = await reportService.getUserSafetySummary(req.params.id);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
