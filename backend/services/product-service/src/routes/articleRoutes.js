const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const articleController = require("../controllers/articleController");

const router = Router();

// Marketing management routes (must come before /:id)
router.get(
  "/marketing/all",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  articleController.listMarketing,
);

// Public article browsing
router.get("/", articleController.listPublic);
router.get("/:id", articleController.getOne);

// Marketing write actions
router.post(
  "/",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  articleController.create,
);

router.put(
  "/:id",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  articleController.update,
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  articleController.remove,
);

module.exports = router;
