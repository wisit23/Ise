const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const messageController = require("./messageController");
const { rateLimit } = require("../../middleware/rateLimit");
const { RATE_LIMITS } = require("../../limits");

const router = Router();

// unread-count is not nested under /conversations/:id — it's a
// cross-conversation total for the current user (see NavBar badge, plan.md).
router.get("/unread-count", requireAuth, messageController.unreadCount);

router.get("/conversations/:id/messages", requireAuth, messageController.list);
// Only the write is limited. Reads (list/unread-count) are what a normal
// open chat window polls as a fallback when the socket is down, so limiting
// those would break the degraded path this service is designed to fall back
// to.
router.post(
  "/conversations/:id/messages",
  requireAuth,
  rateLimit("sendMessage", RATE_LIMITS.sendMessage),
  messageController.send,
);
router.post("/conversations/:id/read", requireAuth, messageController.markRead);

module.exports = router;
