const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const reservationService = require("./reservationService");

const router = Router();

router.post(
  "/:id/reservations",
  requireInternalToken,
  async (req, res, next) => {
    try {
      const reservation = await reservationService.reserveProduct(
        req.params.id,
        req.body.buyerId,
      );
      res.status(reservation.created ? 201 : 200).json(reservation);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id/reservations/:reservationId",
  requireInternalToken,
  async (req, res, next) => {
    try {
      await reservationService.releaseProductReservation(
        req.params.id,
        req.params.reservationId,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/reservations/:reservationId/complete",
  requireInternalToken,
  async (req, res, next) => {
    try {
      await reservationService.completeProductReservation(
        req.params.id,
        req.params.reservationId,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
