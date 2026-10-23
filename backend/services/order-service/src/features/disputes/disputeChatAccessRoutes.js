const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const disputeModel = require("./disputeModel");
const orderModel = require("../../models/orderModel");
const { isSellerVisible } = require("./sellerVisibility");

const router = Router();
router.use(requireInternalToken);

router.get("/disputes/:id/chat-access/:userId", async (req, res, next) => {
  try {
    const dispute = await disputeModel.findById(req.params.id);
    if (!dispute || (dispute.deletedAt && req.query.role !== "ADMIN")) return res.json({ allowed: false, writable: false });
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
      (isSellerRoom && role === "SELLER" && order.sellerId === userId && isSellerVisible(dispute)) ||
      (isLegacyRoom && ((role === "BUYER" && order.buyerId === userId) ||
        (role === "SELLER" && order.sellerId === userId && isSellerVisible(dispute))));
    const agent = role === "AGENT" && dispute.assignedTo === userId &&
      dispute.assignedRole === "CUSTOMER_SERVICE";
    // The CS agent who escalated may read, not write, while T&S reviews.
    const watcher = role === "AGENT" && dispute.escalatedBy === userId &&
      ["ADMIN", "TRUST_AND_SAFETY"].includes(dispute.assignedRole) &&
      dispute.status !== "DECIDED";
    const admin = role === "ADMIN";
    const allowed = validRoom && (party || agent || admin || watcher);
    res.json({ allowed, writable: allowed && !admin && !watcher && !isLegacyRoom && dispute.status !== "DECIDED" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
