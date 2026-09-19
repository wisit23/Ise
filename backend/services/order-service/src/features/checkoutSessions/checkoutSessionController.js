const checkoutSessionService = require("./checkoutSessionService");

async function create(req, res, next) {
  try {
    const session = await checkoutSessionService.create({
      buyerId: req.userId,
      orderIds: req.body.orderIds,
      shippingAddress: req.body.shippingAddress,
      couponCode: req.body.couponCode,
    });
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const session = await checkoutSessionService.get({
      buyerId: req.userId,
      sessionId: req.params.id,
    });
    res.json(session);
  } catch (err) {
    next(err);
  }
}

async function confirm(req, res, next) {
  try {
    const session = await checkoutSessionService.confirm({
      buyerId: req.userId,
      sessionId: req.params.id,
    });
    res.json(session);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, get, confirm };
