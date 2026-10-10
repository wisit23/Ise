const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const { videoUpload } = require("../../middleware/upload");
const productVideoController = require("./productVideoController");

const router = Router();

// GET /videos/feed is public so guests can discover products.
router.get("/feed", productVideoController.listFeed);

// The clip file is written by product-service into its uploads directory.
// Docker mounts that directory to the persistent product_uploads volume.
router.post(
  "/upload",
  requireAuth,
  requireRole("SELLER", "ADMIN"),
  videoUpload.single("video"),
  productVideoController.uploadClip,
);

// POST /videos requires a verified user; role and ownership rules live in the
// service so they are enforced consistently outside HTTP tests too.
router.post("/", requireAuth, productVideoController.createClip);

// UR-11 Swipe-to-Choose: persists or removes the buyer's "interested" swipe. Separate
// from bidding an auction — this just bookmarks/unbookmarks the card.
router.post("/:id/choose", requireAuth, productVideoController.chooseClip);
router.delete("/:id/choose", requireAuth, productVideoController.unchooseClip);
router.post("/:id/unchoose", requireAuth, productVideoController.unchooseClip);

module.exports = router;
