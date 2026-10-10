const { Router } = require("express");
const {
  requireAuth,
  requireCommerceCapability,
  CAPABILITY,
} = require("@reloop/shared");
const checkoutSessionController = require("./checkoutSessionController");

const router = Router();

router.use(requireAuth);
router.post(
  "/",
  requireCommerceCapability(CAPABILITY.BUYER),
  checkoutSessionController.create,
);
router.get("/:id", checkoutSessionController.get);
router.post(
  "/:id/confirm",
  requireCommerceCapability(CAPABILITY.BUYER),
  checkoutSessionController.confirm,
);

module.exports = router;
