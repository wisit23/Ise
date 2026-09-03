const { badRequest } = require("@reloop/shared");
const defaultOrderModel = require("../../models/orderModel");
const defaultProductClient = require("../../services/productClient");

async function reserveOrder(
  { buyerId, productId },
  { orderModel = defaultOrderModel, productClient = defaultProductClient } = {},
) {
  if (!productId) throw badRequest("productId is required");

  const reservation = await productClient.reserveProduct(productId, buyerId);
  const existing = await orderModel.findByReservationId(
    reservation.reservationId,
  );
  if (existing) return { order: existing, created: false };

  try {
    const order = await orderModel.create({
      buyerId,
      sellerId: reservation.product.sellerId,
      productId: reservation.product.id,
      productTitle: reservation.product.title,
      price: reservation.product.price,
      status: "pending_payment",
      reservationId: reservation.reservationId,
      reservationExpiresAt: new Date(reservation.expiresAt),
    });
    return { order, created: true };
  } catch (error) {
    if (error.code === "P2002") {
      const retriedOrder = await orderModel.findByReservationId(
        reservation.reservationId,
      );
      if (retriedOrder) return { order: retriedOrder, created: false };
    }

    if (reservation.created) {
      try {
        await productClient.releaseProductReservation(
          productId,
          reservation.reservationId,
        );
      } catch (compensationError) {
        error.compensationError = compensationError;
      }
    }
    throw error;
  }
}

module.exports = { reserveOrder };
