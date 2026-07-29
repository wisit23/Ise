const { Router } = require("express");
const { requireAuth, requireInternalToken } = require("@reloop/shared");
const productController = require("../controllers/productController");

const router = Router();

// Public browsing (gateway lets these through without a bearer token).
router.get("/feed", productController.feed);
router.get("/search", productController.search);

// Swipe feed ("ปัดดูสินค้า") — must come before "/:id" for the same reason.
router.get("/videos/feed", productController.videoFeed);
router.post("/videos", requireAuth, productController.createVideoClip);

// Seller's own listings — must come before "/:id" so these aren't read as an id.
router.get("/mine", requireAuth, productController.mine);
router.get("/by-seller/:sellerId", productController.bySeller);
router.get("/categories", productController.listCategories);
router.get("/conditions", productController.listConditions);

router.get("/:id", productController.getOne);
router.post("/", requireAuth, productController.create);
router.patch("/:id", requireAuth, productController.update);
router.delete("/:id", requireAuth, productController.remove);

router.patch(
  "/:id/internal-status",
  requireInternalToken,
  productController.markStatusInternal,
);

module.exports = router;
