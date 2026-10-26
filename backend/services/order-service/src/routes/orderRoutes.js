const { Router } = require("express");
const {
  requireAuth,
  requireInternalToken,
  requireCustomerAccount,
  requireCommerceCapability,
  CAPABILITY,
} = require("@reloop/shared");
const orderController = require("../controllers/orderController");
const disputeController = require("../features/disputes/disputeController");
const disputeRoutes = require("../features/disputes/disputeRoutes");
const supportRoutes = require("../features/support/supportRoutes");
const checkoutSessionRoutes = require("../features/checkoutSessions/checkoutSessionRoutes");

const router = Router();
router.use(require("../features/orderVouchers/orderVoucherRoutes"));
router.use("/recommendation-history", require("../features/recommendationHistory/recommendationHistoryRoutes"));
router.use(
  "/internal/marketing-audience",
  require("../features/marketingAudience/marketingAudienceRoutes"),
);

// Feature routers must come before "/:id" so Express doesn't read "disputes"
// or "support" as an order id.
router.use("/disputes", disputeRoutes);
router.use("/support", supportRoutes);
router.use("/checkout-sessions", checkoutSessionRoutes);
router.use("/checkouts", checkoutSessionRoutes);
router.use("/cart", require("../features/cart/cartRoutes"));

router.post(
  "/",
  requireAuth,
  requireCustomerAccount,
  requireCommerceCapability(CAPABILITY.BUYER),
  orderController.create,
);
router.get("/mine", requireAuth, orderController.mine);
router.get("/selling", requireAuth, orderController.selling);
router.get(
  "/:id/internal",
  requireInternalToken,
  orderController.getOneInternal,
);
router.get(
  "/internal/by-product/:productId",
  requireInternalToken,
  orderController.getByProductInternal,
);
// Called by product-service when an auction closes with a winning bid.
router.post(
  "/internal/from-auction",
  requireInternalToken,
  orderController.createFromAuction,
);
router.get("/:id", requireAuth, orderController.getOne);
router.patch("/:id/confirm", requireAuth, orderController.confirmOrder);
router.post("/:id/confirm", requireAuth, orderController.confirmOrder);
router.patch("/:id/reject", requireAuth, orderController.rejectOrder);
router.post("/:id/reject", requireAuth, orderController.rejectOrder);
router.patch("/:id/status", requireAuth, orderController.updateStatus);
router.patch("/:id/shipping-details", requireAuth, orderController.updateShippingDetails);
router.patch(
  "/:id/shipping-address",
  requireAuth,
  orderController.updateShippingAddress,
);
router.patch(
  "/:id/pay",
  requireAuth,
  requireCustomerAccount,
  requireCommerceCapability(CAPABILITY.BUYER),
  orderController.pay,
);
router.post("/:id/disputes", requireAuth, disputeController.open);

module.exports = router;
