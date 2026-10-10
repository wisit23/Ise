const { Router } = require("express");
const {
  requireAuth,
  requirePermission,
  requireInternalToken,
  fromGatewayHeaders,
  requireCommerceCapability,
  CAPABILITY,
} = require("@reloop/shared");
const productController = require("../controllers/productController");
const productVideoRoutes = require("../features/product-videos/productVideoRoutes");
const auctionRoutes = require("../features/auctions/auctionRoutes");
const articleRoutes = require("./articleRoutes");
const campaignRoutes = require("../features/campaigns/campaignRoutes");

const router = Router();

// Public browsing (gateway lets these through without a bearer token).
router.get("/feed", productController.feed);
router.get("/search", productController.search);

// Feature routes must come before "/:id" so Express does not read "videos"/
// "auctions"/"articles"/"campaigns" as a product id.
router.use("/videos", productVideoRoutes);
router.use("/auctions", auctionRoutes);
router.use("/articles", articleRoutes);
router.use("/campaigns", campaignRoutes);

// Seller's own listings — must come before "/:id" so these aren't read as an id.
router.get("/mine", requireAuth, productController.mine);
router.get(
  "/admin/search",
  requireAuth,
  requirePermission("admin:moderation:remove"),
  productController.adminSearch,
);
router.get(
  "/admin/:id",
  requireAuth,
  requirePermission("admin:moderation:remove"),
  productController.getForModeration,
);
router.get(
  "/by-seller/:sellerId",
  fromGatewayHeaders,
  productController.bySeller,
);
router.get("/categories", productController.listCategories);
router.get("/conditions", productController.listConditions);
router.get("/filters", productController.listFilterOptions);

router.get("/:id", fromGatewayHeaders, productController.getOne);
router.post(
  "/",
  requireAuth,
  requireCommerceCapability(CAPABILITY.SELLER),
  productController.create,
);
router.patch(
  "/:id/visibility",
  requireAuth,
  requireCommerceCapability(CAPABILITY.SELLER),
  productController.toggleVisibility,
);
router.patch(
  "/:id",
  requireAuth,
  requireCommerceCapability(CAPABILITY.SELLER),
  productController.update,
);
router.delete(
  "/:id",
  requireAuth,
  requireCommerceCapability(CAPABILITY.SELLER),
  productController.remove,
);

router.patch(
  "/:id/internal-status",
  requireInternalToken,
  productController.markStatusInternal,
);

module.exports = router;
