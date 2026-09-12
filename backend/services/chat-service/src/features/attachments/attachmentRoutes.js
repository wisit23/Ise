const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const attachmentController = require("./attachmentController");
const { rateLimit } = require("../../middleware/rateLimit");
const { RATE_LIMITS } = require("../../limits");

const router = Router();

// Ordered before multer runs (inside attachmentController.send) so a
// rejected upload never gets written to disk in the first place.
router.post(
  "/conversations/:id/attachments",
  requireAuth,
  rateLimit("uploadAttachment", RATE_LIMITS.uploadAttachment),
  attachmentController.send,
);

// Reads go through requireAuth + a participant check in the service — this
// path is deliberately NOT static-served anywhere (see attachmentStorage's
// comment on why chat attachments can't live in product-service's public
// uploads/ tree).
router.get(
  "/conversations/:id/attachments/:messageId",
  requireAuth,
  attachmentController.download,
);

module.exports = router;
