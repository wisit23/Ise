const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const internalController = require("./internalController");
const ticketModel = require("../tickets/ticketModel");

const router = Router();
router.use(requireInternalToken);

router.post("/chat-events", internalController.handleChatEvent);

router.get("/tickets/:id/chat-access/:userId", async (req, res, next) => {
  try {
    const ticket = await ticketModel.findById(req.params.id);
    if (!ticket) return res.json({ allowed: false, writable: false });
    const { userId } = req.params;
    const role = req.query.role;
    const isRequester = role === "BUYER" && ticket.requesterId === userId;
    const isAdmin = role === "ADMIN";
    const isAgent = role === "AGENT" && ticket.status !== "ESCALATED" &&
      (ticket.assigneeId === null || ticket.assigneeId === userId);
    const allowed = isRequester || isAdmin || isAgent;
    const writable = allowed && !isAdmin && ticket.status !== "CLOSED" &&
      (!isAgent || ticket.assigneeId === userId);
    res.json({ allowed, writable });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
