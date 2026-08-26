const { Router } = require("express");
const { requireInternalToken, badRequest } = require("@reloop/shared");
const moderationService = require("./moderationService");

const router = Router();

// Admin (auth-service) is the only caller — command comes in over the
// network with the shared internal token, never a direct DB write
// (ADM-DEC-001: owner-service command only).
router.use(requireInternalToken);

router.post("/:id/remove", async (req, res, next) => {
  try {
    if (!req.body.reason) throw badRequest("reason is required");
    const product = await moderationService.removeProduct(
      req.params.id,
      req.body.reason,
    );
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/restore", async (req, res, next) => {
  try {
    const product = await moderationService.restoreProduct(req.params.id);
    res.json(product);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
