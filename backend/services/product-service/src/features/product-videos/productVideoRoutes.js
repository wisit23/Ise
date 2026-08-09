const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const productVideoController = require("./productVideoController");

const router = Router();

// GET /videos/feed is public so guests can discover products.
router.get("/feed", productVideoController.listFeed);

// POST /videos requires a verified user; role and ownership rules live in the
// service so they are enforced consistently outside HTTP tests too.
router.post("/", requireAuth, productVideoController.createClip);

module.exports = router;
