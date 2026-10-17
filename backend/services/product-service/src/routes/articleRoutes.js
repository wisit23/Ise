const { Router } = require("express");
const {
  requireAuth,
  requireRole,
  verifyAccessToken,
} = require("@reloop/shared");
const articleController = require("../controllers/articleController");

const router = Router();

function optionalAuth(req, res, next) {
  req.userId = null;
  req.userRole = null;
  req.userRoles = [];
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.userId = payload.sub;
      req.userRole = payload.role;
      req.userRoles = payload.roles || (payload.role ? [payload.role] : []);
    } catch {
      // Invalid optional credentials are treated as a guest reader.
    }
  }
  next();
}

// Marketing management routes (must come before /:id)
router.get(
  "/marketing/all",
  requireAuth,
  requireRole("MARKETING"),
  articleController.listMarketing,
);

// Public article browsing
router.get("/", articleController.listPublic);
router.post("/:id/views/start", optionalAuth, articleController.startView);
router.post("/:id/views/complete", optionalAuth, articleController.completeView);
router.get("/:id", articleController.getOne);

// Marketing write actions
router.post(
  "/",
  requireAuth,
  requireRole("MARKETING"),
  articleController.create,
);

router.put(
  "/:id",
  requireAuth,
  requireRole("MARKETING"),
  articleController.update,
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("MARKETING"),
  articleController.remove,
);

module.exports = router;
