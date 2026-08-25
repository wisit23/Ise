const { Router } = require("express");
const { requireAuth, requireInternalToken } = require("@reloop/shared");
const orderController = require("../controllers/orderController");
const disputeController = require("../features/disputes/disputeController");
const disputeRoutes = require("../features/disputes/disputeRoutes");
const supportRoutes = require("../features/support/supportRoutes");

const router = Router();

// Feature routers must come before "/:id" so Express doesn't read "disputes"
// or "support" as an order id.
router.use("/disputes", disputeRoutes);
router.use("/support", supportRoutes);

router.post("/", requireAuth, orderController.create);
router.get("/mine", requireAuth, orderController.mine);
router.get("/selling", requireAuth, orderController.selling);
router.get(
  "/:id/internal",
  requireInternalToken,
  orderController.getOneInternal,
);
router.get("/:id", requireAuth, orderController.getOne);
router.patch("/:id/status", requireAuth, orderController.updateStatus);
router.patch("/:id/pay", requireAuth, orderController.pay);
router.post("/:id/disputes", requireAuth, disputeController.open);

module.exports = router;
