const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const { videoUpload } = require("../../middleware/upload");
const productVideoController = require("./productVideoController");

const router = Router();

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    req.userId = null;
    req.userRole = null;
    req.userRoles = [];
    return next();
  }

  // When Authorization is present, verify JWT and session via trusted auth middleware
  return requireAuth(req, res, next);
}

// GET /videos/feed is public so guests can discover products.
router.get("/feed", optionalAuth, productVideoController.listFeed);

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

function requireBuyerRole(req, res, next) {
  const isBuyer =
    req.userRole === "BUYER" ||
    (Array.isArray(req.userRoles) && req.userRoles.includes("BUYER"));
  if (!isBuyer) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// UR-11 Swipe-to-Choose: persists or removes the buyer's "interested" swipe. Separate
// from bidding an auction — this just bookmarks/unbookmarks the card.
// Enforce strictly BUYER role (SELLER, MARKETING, ADMIN get 403 Forbidden).
router.post(
  "/:id/choose",
  requireAuth,
  requireBuyerRole,
  productVideoController.chooseClip,
);
router.delete(
  "/:id/choose",
  requireAuth,
  requireBuyerRole,
  productVideoController.unchooseClip,
);
router.post(
  "/:id/unchoose",
  requireAuth,
  requireBuyerRole,
  productVideoController.unchooseClip,
);

module.exports = router;
