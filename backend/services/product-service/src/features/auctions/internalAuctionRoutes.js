const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const auctionService = require("./auctionService");

const router = Router();

router.post(
  "/:auctionId/advance-winner",
  requireInternalToken,
  async (req, res, next) => {
    try {
      res.json(
        await auctionService.advanceWinnerAfterPaymentTimeout({
          auctionId: req.params.auctionId,
          currentBidId: req.body.currentBidId,
          orderId: req.body.orderId,
          expiredBuyerId: req.body.expiredBuyerId,
        }),
      );
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
