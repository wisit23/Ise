const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const conversationController = require("./conversationController");
const { rateLimit } = require("../../middleware/rateLimit");
const { RATE_LIMITS } = require("../../limits");

const router = Router();

router.post(
  "/conversations",
  requireAuth,
  rateLimit("createConversation", RATE_LIMITS.createConversation),
  conversationController.create,
);
router.get("/conversations", requireAuth, conversationController.list);
router.get("/conversations/:id", requireAuth, conversationController.getOne);

module.exports = router;
