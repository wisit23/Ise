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
    const channel = req.query.channel;
    const isBuyerRoom = channel === "DISPUTE_BUYER";
    const isSellerRoom = channel === "DISPUTE_SELLER";
    const isLegacyRoom = channel === "DISPUTE";
    const validRoom = isBuyerRoom || isSellerRoom || isLegacyRoom;
    const party = (isBuyerRoom && role === "BUYER" && order.buyerId === userId) ||
      (isSellerRoom && role === "SELLER" && order.sellerId === userId) ||
      (isLegacyRoom && ((role === "BUYER" && order.buyerId === userId) ||
        (role === "SELLER" && order.sellerId === userId)));
    const agent = role === "AGENT" && dispute.assignedTo === userId &&
      dispute.assignedRole === "CUSTOMER_SERVICE";
    const admin = role === "ADMIN";
    const allowed = validRoom && (party || agent || admin);
    res.json({ allowed, writable: allowed && !admin && !isLegacyRoom && dispute.status !== "DECIDED" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
