const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const productVideoController = require("./productVideoController");

const router = Router();

// GET /videos/feed is public so guests can discover products.
router.get("/feed", productVideoController.listFeed);

// POST /videos requires a verified user; role and ownership rules live in the
// service so they are enforced consistently outside HTTP tests too.
router.post("/", requireAuth, productVideoController.createClip);

// UR-11 Swipe-to-Choose: persists the buyer's "interested" swipe. Separate
// from bidding an auction — this just bookmarks the card.
router.post("/:id/choose", requireAuth, productVideoController.chooseClip);

module.exports = router;
