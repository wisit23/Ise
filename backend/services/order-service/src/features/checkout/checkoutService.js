const crypto = require("node:crypto");
const { badRequest } = require("@reloop/shared");
const defaultOrderModel = require("../../models/orderModel");
const defaultProductClient = require("../../services/productClient");
const { money } = require("../../models/money");

async function reserveOrder(
  { buyerId, productId, campaignId },
  { orderModel = defaultOrderModel, productClient = defaultProductClient } = {},
) {
  if (!productId) throw badRequest("productId is required");

  // 1. Reserve Product first
  const reservation = await productClient.reserveProduct(productId, buyerId);

  // If existing order already created from this reservation: return it immediately without updating price
  const existing = await orderModel.findByReservationId(
    reservation.reservationId,
  );
  if (existing) {
    return { order: existing, created: false };
  }

  // 2. Pre-generate orderId
  const orderId = crypto.randomUUID();

  // 3. Server-side Voucher Validation & Discount Calculation via quoteAndHold
  let verifiedCampaignId = null;
  let verifiedCampaignCode = null;
  let verifiedDiscountAmount = money(0);
  let originalAmount;
  try {
    originalAmount = money(reservation.product.price, "product.price");
  } catch (error) {
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
  let verifiedFinalPrice = originalAmount;

  if (campaignId) {
    try {
      const quote = await productClient.quoteAndHold(campaignId, {
        userId: buyerId,
        orderId,
        productId,
      });
      if (quote) {
        verifiedCampaignId = quote.campaignId;
        verifiedCampaignCode = quote.campaignCode;
        verifiedDiscountAmount = money(
          quote.discountAmount ?? 0,
          "discountAmount",
        );
        verifiedFinalPrice = money(
          quote.finalPrice ?? originalAmount.minus(verifiedDiscountAmount),
          "finalPrice",
        );
        if (
          !verifiedFinalPrice.equals(
            originalAmount.minus(verifiedDiscountAmount),
          )
        ) {
          throw badRequest("voucher quote has inconsistent prices");
        }
      }
    } catch (valErr) {
      if (verifiedCampaignId) {
        try {
          await productClient.releaseVoucher(verifiedCampaignId, {
            userId: buyerId,
            orderId,
          });
        } catch (compensationError) {
          valErr.voucherCompensationError = compensationError;
        }
      }
      if (reservation.created) {
        try {
          await productClient.releaseProductReservation(
            productId,
            reservation.reservationId,
          );
        } catch {
          // ignore compensation failure
        }
      }
      throw valErr;
    }
  }

  // 4. Create Order with pre-generated orderId and backend-calculated prices
  try {
    const order = await orderModel.create({
      id: orderId,
      buyerId,
      sellerId: reservation.product.sellerId,
      productId: reservation.product.id,
      originalAmount,
      ordersAmount: verifiedFinalPrice,
      orderType: "BUY_NOW",
      campaignId: verifiedCampaignId,
      status: "pending_payment",
      basket: {
        create: {
          id: reservation.reservationId,
          buyerId,
          productId: reservation.product.id,
          status: "locked",
          lockAt: new Date(),
          unlockAt: new Date(reservation.expiresAt),
        },
      },
    });
    return {
      order: {
        ...order,
        productTitle: reservation.product.title,
        price: Number(originalAmount),
        finalPrice: Number(verifiedFinalPrice),
        discountAmount: Number(verifiedDiscountAmount),
        campaignCode: verifiedCampaignCode,
        reservationId: reservation.reservationId,
        reservationExpiresAt: new Date(reservation.expiresAt),
      },
      created: true,
    };
  } catch (error) {
    if (error.code === "P2002") {
      const retriedOrder = await orderModel.findByReservationId(
        reservation.reservationId,
      );
      if (retriedOrder) return { order: retriedOrder, created: false };
    }

    // 5. Compensation on failure: release both voucher hold and product reservation
    if (verifiedCampaignId) {
      try {
        await productClient.releaseVoucher(verifiedCampaignId, {
          userId: buyerId,
          orderId,
        });
      } catch (voucherCompErr) {
        error.voucherCompensationError = voucherCompErr;
      }
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
