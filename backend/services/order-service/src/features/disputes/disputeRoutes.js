// Mounted at "/disputes" in orderRoutes.js — handles everything addressed by
// dispute id. Opening a dispute (addressed by *order* id) is a separate
// route registered directly on orderRoutes.js alongside the other
// "/:id/..." order routes.
const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const disputeController = require("./disputeController");

const router = Router();

router.get("/queue", requireAuth, disputeController.queue);
router.get("/by-order/:orderId", requireAuth, disputeController.getByOrderId);
router.get("/:id", requireAuth, disputeController.getOne);
router.post("/:id/evidence", requireAuth, disputeController.uploadEvidence);
router.get(
  "/:id/evidence/:evidenceId",
  requireAuth,
  disputeController.viewEvidence,
);
router.post("/:id/decision", requireAuth, disputeController.decide);

module.exports = router;
