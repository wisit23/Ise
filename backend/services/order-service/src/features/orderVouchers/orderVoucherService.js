const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const productClient = require("../../services/productClient");
const orderModel = require("../../models/orderModel");
const { money } = require("../../models/money");

function createOrderVoucherService(db = prisma, products = productClient) {
  async function update({ orderId, buyerId, campaignId, now = new Date() }) {
    if (
      campaignId !== null &&
      (typeof campaignId !== "string" || !campaignId.trim())
    )
      throw badRequest("campaignId must be a voucher ID or null");
    let attemptedNew = null;
    let previous = null;
    let releasedPrevious = false;
    try {
      return await db.$transaction(
        async (tx) => {
          // Serialize voucher edits with checkout creation and order transitions.
          await tx.$queryRaw`SELECT order_id FROM orders WHERE order_id = ${orderId} FOR UPDATE`;
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: orderModel.INCLUDE,
          });
          if (!order) throw notFound("order not found");
          if (order.buyerId !== buyerId)
            throw forbidden("this order belongs to another buyer");
          if (
            order.checkoutId ||
            !["pending", "pending_payment"].includes(order.status)
          )
            throw conflict("ไม่สามารถเปลี่ยนโค้ดหลังยืนยันรายการชำระเงินได้");
          if (!order.basketId || !order.basket || order.basket.unlockAt <= now)
            throw conflict(
              "รายการนี้ไม่มีการจองที่ใช้งานได้ หรือหมดเวลาจองแล้ว",
            );
          if ((order.campaignId || null) === campaignId)
            return orderModel.view(order);
          previous = order.campaignId || null;
          let finalPrice = money(order.originalAmount);
          let campaignCode = null;
          if (campaignId) {
            attemptedNew = campaignId;
            const quote = await products.quoteAndHold(campaignId, {
              userId: buyerId,
              orderId,
              productId: order.productId,
            });
            if (!quote || quote.campaignId !== campaignId)
              throw badRequest("invalid voucher quote");
            const discount = money(quote.discountAmount, "discountAmount");
            finalPrice = money(quote.finalPrice, "finalPrice");
            if (
              discount.greaterThan(order.originalAmount) ||
              !finalPrice.plus(discount).equals(order.originalAmount)
            )
              throw badRequest("voucher quote has inconsistent prices");
            campaignCode = quote.campaignCode;
          }
          if (previous) {
            releasedPrevious = true;
            await products.releaseVoucher(previous, {
              userId: buyerId,
              orderId,
            });
          }
          const saved = await tx.order.update({
            where: { id: orderId },
            data: {
              campaignId,
              campaignCode,
              ordersAmount: finalPrice,
              version: { increment: 1 },
            },
            include: orderModel.INCLUDE,
          });
          await tx.orderLog.create({
            data: orderModel.logData(order, buyerId, "VOUCHER_CHANGED", {
              from: previous,
              to: campaignId,
            }),
          });
          return orderModel.view(saved);
        },
        { timeout: 20000 },
      );
    } catch (error) {
      // Restore voucher ownership if the local transaction fails after remote calls.
      try {
        if (attemptedNew || releasedPrevious)
          await db.$transaction(
            async (tx) => {
              // Reacquire the row lock so compensation cannot release a voucher
              // successfully applied by a concurrent retry after the rollback.
              await tx.$queryRaw`SELECT order_id FROM orders WHERE order_id = ${orderId} FOR UPDATE`;
              const current = await tx.order.findUnique({
                where: { id: orderId },
              });
              const failures = [];
              if (attemptedNew && current?.campaignId !== attemptedNew) {
                try {
                  await products.releaseVoucher(attemptedNew, {
                    userId: buyerId,
                    orderId,
                  });
                } catch (failure) {
                  failures.push(failure);
                }
              }
              if (
                releasedPrevious &&
                previous &&
                current?.campaignId === previous
              ) {
                try {
                  await products.holdVoucher(previous, {
                    userId: buyerId,
                    orderId,
                  });
                } catch (failure) {
                  failures.push(failure);
                }
              }
              if (failures.length) throw failures[0];
            },
            { timeout: 20000 },
          );
      } catch (compensationError) {
        error.voucherCompensationError = compensationError;
      }
      throw error;
    }
  }
  return { update };
}
module.exports = createOrderVoucherService();
module.exports.createOrderVoucherService = createOrderVoucherService;
