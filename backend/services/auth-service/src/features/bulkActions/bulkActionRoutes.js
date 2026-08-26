const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const bulkActionService = require("./bulkActionService");

const router = Router();

// No requirePermission here on purpose — different actions need different
// permissions (see actionRegistry.js), so bulkActionService checks the
// specific one for the requested `action` after looking it up.
router.post("/admin/bulk", requireAuth, async (req, res, next) => {
  try {
    const result = await bulkActionService.executeBatch({
      action: req.body.action,
      ids: req.body.ids,
      reason: req.body.reason,
      dryRun: req.body.dryRun,
      idempotencyKey: req.body.idempotencyKey,
      adminId: req.userId,
      permissions: req.permissions,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
