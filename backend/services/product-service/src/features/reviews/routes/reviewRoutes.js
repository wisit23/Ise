const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const reviewController = require("../controllers/reviewController");

const router = Router();

// Public — buyers browsing a store need to see its rating without logging in.
router.get("/by-seller/:sellerId", reviewController.bySeller);
router.get("/by-seller/:sellerId/summary", reviewController.summaryBySeller);

router.get("/mine", requireAuth, reviewController.mine);
router.get("/by-order/:orderId", requireAuth, reviewController.byOrder);
router.post("/", requireAuth, reviewController.create);

module.exports = router;
