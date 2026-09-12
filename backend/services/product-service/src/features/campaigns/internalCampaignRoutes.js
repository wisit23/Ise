const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const campaignController = require("./campaignController");

const router = Router();

router.post("/:id/hold", requireInternalToken, campaignController.hold);
router.post("/:id/release", requireInternalToken, campaignController.release);
router.post("/:id/complete", requireInternalToken, campaignController.complete);

module.exports = router;
