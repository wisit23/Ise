const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const controller = require("./marketingAudienceController");

const router = Router();
router.get("/purchases", requireInternalToken, controller.listPurchases);

module.exports = router;
