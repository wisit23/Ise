const { Router } = require("express");
const {
  requireAuth,
  requireCustomerAccount,
  requireCommerceCapability,
  CAPABILITY,
} = require("@reloop/shared");
const { createCartService } = require("./cartService");
const activities = require("../../services/buyerActivityClient");
const chat = require("../../services/chatClient");
const service = createCartService({
  orderPlaced: async (order) => {
    await activities.recordOrderActivity(order, "ORDER_PLACED", {
      reservationId: order.reservationId,
    });
    await chat.notifyOrderPlaced(order);
  },
});
const router = Router();
router.use(requireAuth, requireCustomerAccount);
const buyer = requireCommerceCapability(CAPABILITY.BUYER);
router.get("/", async (req, res, next) => {
  try {
    res.json(await service.list({ buyerId: req.userId }));
  } catch (error) {
    next(error);
  }
});
router.post("/", buyer, async (req, res, next) => {
  try {
    res
      .status(201)
      .json(
        await service.add({
          buyerId: req.userId,
          productId: req.body.productId,
          campaignId: req.body.campaignId,
        }),
      );
  } catch (error) {
    next(error);
  }
});
router.post("/prepare", buyer, async (req, res, next) => {
  try {
    res.json(
      await service.prepare({
        buyerId: req.userId,
        basketIds: req.body.basketIds,
      }),
    );
  } catch (error) {
    next(error);
  }
});
router.delete("/:id", async (req, res, next) => {
  try {
    await service.remove({ buyerId: req.userId, basketId: req.params.id });
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});
module.exports = router;
