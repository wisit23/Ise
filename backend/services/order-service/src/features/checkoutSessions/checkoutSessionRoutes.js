const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const checkoutSessionController = require("./checkoutSessionController");

const router = Router();

router.use(requireAuth);
router.post("/", checkoutSessionController.create);
router.get("/:id", checkoutSessionController.get);
router.post("/:id/confirm", checkoutSessionController.confirm);
router.patch("/:id/address", checkoutSessionController.updateAddress);

module.exports = router;
