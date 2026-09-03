const reservationService = require("./reservationService");

async function reserve(req, res, next) {
  try {
    const result = await reservationService.reserve({
      productId: req.params.id,
      buyerId: req.body.buyerId,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function release(req, res, next) {
  try {
    await reservationService.release({
      productId: req.params.id,
      reservationId: req.params.reservationId,
      buyerId: req.body.buyerId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function confirm(req, res, next) {
  try {
    await reservationService.confirm({
      productId: req.params.id,
      reservationId: req.params.reservationId,
      buyerId: req.body.buyerId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { reserve, release, confirm };
