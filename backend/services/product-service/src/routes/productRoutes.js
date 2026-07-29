const { Router } = require("express");
const { requireAuth, requireInternalToken } = require("@reloop/shared");
const productController = require("../controllers/productController");

const router = Router();

// Public browsing (gateway lets these through without a bearer token).
router.get("/feed", productController.feed);
router.get("/search", productController.search);

router.get("/videos/feed", productController.getVideoFeed);

// Seller's own listings — must come before "/:id" so "mine" is not read as an id.
router.get("/mine", requireAuth, productController.getMyProducts);

// อัปโหลดวิดีโอ (ใช้ requireAuth จาก @reloop/shared ตัวเดียวกับเส้นทางอื่น)
router.post("/videos", requireAuth, productController.createVideo);

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