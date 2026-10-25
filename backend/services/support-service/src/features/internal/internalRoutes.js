const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const internalController = require("./internalController");

const router = Router();
router.use(requireInternalToken);

router.post("/chat-events", internalController.handleChatEvent);
router.get("/tickets/:id/chat-access/:userId", internalController.chatAccess);

module.exports = router;
