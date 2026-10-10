const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const internalController = require("./internalController");

const router = Router();
router.use(requireInternalToken);

router.post("/chat-events", internalController.handleChatEvent);

module.exports = router;
