const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const internalController = require("./internalController");

const router = Router();

// Every route here requires x-internal-token (see product-service's
// lock/unlock/sold endpoints for the same pattern) — this is how another
// service opens a room or sends a SYSTEM message without a user's JWT.
router.use(requireInternalToken);

router.post("/conversations", internalController.createConversation);
router.get(
  "/conversations/by-context/:type/:id",
  internalController.getByContext,
);
router.post("/conversations/:id/messages", internalController.sendMessage);
router.post(
  "/conversations/:id/participants",
  internalController.addParticipant,
);
router.patch("/conversations/:id/status", internalController.updateStatus);
router.get("/conversations/:id/transcript", internalController.getTranscript);

module.exports = router;
