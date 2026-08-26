const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const helpController = require("./helpController");

const router = Router();

// Public — FAQ deflection (WF-10 step 2) must work for guests too.
router.get("/", helpController.search);

// Must come before "/:id/publish" would if this had a GET "/:id" — kept
// under "/manage" anyway so it never collides with a future article-by-id route.
router.get("/manage", requireAuth, helpController.manage);

router.post("/", requireAuth, helpController.create);
router.patch("/:id/publish", requireAuth, helpController.publish);

module.exports = router;
