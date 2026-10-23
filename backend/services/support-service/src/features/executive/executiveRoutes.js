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

router.get(
  "/tickets/:id",
  requireAuth,
  requireRole("EXECUTIVE"),
  executiveController.getTicket,
);

module.exports = router;
