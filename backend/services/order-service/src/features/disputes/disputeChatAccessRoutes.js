const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const disputeModel = require("./disputeModel");
const orderModel = require("../../models/orderModel");

const router = Router();
router.use(requireInternalToken);

router.get("/disputes/:id/chat-access/:userId", async (req, res, next) => {
  try {
    const dispute = await disputeModel.findById(req.params.id);
    if (!dispute) return res.json({ allowed: false, writable: false });
    const order = await orderModel.findById(dispute.orderId);
    if (!order) return res.json({ allowed: false, writable: false });
    const { userId } = req.params;
    const role = req.query.role;
    const allowed =
      (role === "BUYER" && order.buyerId === userId) ||
      (role === "SELLER" && order.sellerId === userId) ||
      (role === "AGENT" && dispute.assignedTo === userId &&
        dispute.assignedRole !== "TRUST_AND_SAFETY") ||
      role === "ADMIN";
    res.json({ allowed, writable: allowed && dispute.status !== "DECIDED" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
