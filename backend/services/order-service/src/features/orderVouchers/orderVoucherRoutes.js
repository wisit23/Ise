const { Router } = require("express");
const {
  requireAuth,
  requireCustomerAccount,
  requireCommerceCapability,
  CAPABILITY,
} = require("@reloop/shared");
const service = require("./orderVoucherService");
function createOrderVoucherRoutes(vouchers = service) {
  const router = Router();
  router.patch(
    "/:id/voucher",
    requireAuth,
    requireCustomerAccount,
    requireCommerceCapability(CAPABILITY.BUYER),
    async (req, res, next) => {
      try {
        const order = await vouchers.update({
          orderId: req.params.id,
          buyerId: req.userId,
          campaignId: req.body.campaignId,
        });
        res.set("Cache-Control", "private, no-store");
        res.json(order);
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
module.exports = createOrderVoucherRoutes();
module.exports.createOrderVoucherRoutes = createOrderVoucherRoutes;
