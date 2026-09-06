// Internal endpoint consumed by product-service to record seller listing
// activity.  Protected by the shared INTERNAL_SERVICE_TOKEN secret — the
// same guard used by order-service's product-lock calls.
const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const sellerActivityService = require("./sellerActivityService");

const router = Router();

// POST /internal/seller/:sellerId/activity
router.post(
  "/seller/:sellerId/activity",
  requireInternalToken,
  async (req, res, next) => {
    try {
      await sellerActivityService.recordActivity(req.params.sellerId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
