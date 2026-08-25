const { Router } = require("express");
const {
  requireAuth,
  requirePermission,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const adminKycService = require("./adminKycService");

const router = Router();

router.use(requireAuth, requirePermission("admin:kyc:decide"));

router.get("/", async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const { items, total } = await adminKycService.listQueue({
      ...pagination,
      status: req.query.status,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/decision", async (req, res, next) => {
  try {
    const result = await adminKycService.decideKyc({
      applicationId: req.params.id,
      decision: req.body.decision,
      reason: req.body.reason,
      version: req.body.version,
      adminId: req.userId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
