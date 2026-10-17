const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const executiveController = require("./executiveController");

const router = Router();

router.get(
  "/tickets",
  requireAuth,
  requireRole("EXECUTIVE"),
  executiveController.getTickets,
);

module.exports = router;
