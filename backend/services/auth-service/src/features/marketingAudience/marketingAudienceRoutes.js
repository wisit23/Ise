const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const controller = require("./marketingAudienceController");

const router = Router();
router.get("/buyer-profiles", requireInternalToken, controller.listBuyerProfiles);

module.exports = router;
