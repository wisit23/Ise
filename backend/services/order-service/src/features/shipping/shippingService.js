const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");

const ADDRESS_FIELDS = [
  "recipientName",
  "phone",
  "addressLine",
  "subdistrict",
  "district",
  "province",
  "postalCode",
];

function normalizeAddress(address) {
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    throw badRequest("shippingAddress is required");
  }
  return Object.fromEntries(
    ADDRESS_FIELDS.map((field) => {
      const value =
        typeof address[field] === "string" ? address[field].trim() : "";
      if (field === "recipientName" && !value)
        throw badRequest("กรุณากรอกชื่อผู้รับ");
      if (field === "phone" && !/^[0-9]{10}$/.test(value)) {
        throw badRequest("เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก");
      }
      if (field === "postalCode" && !/^[0-9]{5}$/.test(value)) {
        throw badRequest("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");
      }
      if (!value) throw badRequest(`shippingAddress.${field} is required`);
      return [field, value];
    }),
  );
}

function createShippingService(db) {
  async function updateAddress({
    orderId,
    buyerId,
    addressId,
    shippingAddress,
    version,
  }) {
    if (typeof addressId !== "string" || !addressId.trim()) {
      throw badRequest("addressId is required");
    }
    const addressSnapshot = normalizeAddress(shippingAddress);
    return db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipping: true },
      });
      if (!order) throw notFound("order not found");
      if (order.buyerId !== buyerId)
        throw forbidden("only the buyer can change the shipping address");
      if (
        order.status !== "confirmed" ||
        !order.shipping ||
        ["shipped", "delivered"].includes(order.shipping.status)
      ) {
        throw conflict(
          "only confirmed orders awaiting shipment can change address",
        );
      }
      if (version !== undefined && version !== order.version) {
        throw conflict("order was modified — reload and retry");
      }
      // Shipping and address writers serialize on the same Order version.
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          buyerId,
          status: "confirmed",
          version: order.version,
        },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1)
        throw conflict("order changed — reload and retry");
      const updated = await tx.shipping.updateMany({
        where: { orderId, status: order.shipping.status },
        data: { addressId: addressId.trim(), addressSnapshot },
      });
      if (updated.count !== 1)
        throw conflict("shipping changed — reload and retry");
      await tx.orderLog.create({
        data: {
          orderId,
          buyerId,
          sellerId: order.sellerId,
          actorId: buyerId,
          action: "SHIPPING_ADDRESS_CHANGED",
          detail: JSON.stringify({
            before: {
              addressId: order.shipping.addressId,
              addressSnapshot: order.shipping.addressSnapshot,
            },
            after: { addressId: addressId.trim(), addressSnapshot },
          }),
        },
      });
      return tx.shipping.findUnique({ where: { orderId } });
    });
  }
  async function markShipped({
    orderId,
    actorId,
    version,
    company,
    trackingNumber,
  }) {
    if (
      typeof company !== "string" ||
      !company.trim() ||
      typeof trackingNumber !== "string" ||
      !trackingNumber.trim()
    ) {
      throw badRequest(
        "company and trackingNumber are required to ship an order",
      );
    }
    return db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipping: true },
      });
      if (!order) throw notFound("order not found");
      if (order.buyerId !== actorId && order.sellerId !== actorId)
        throw forbidden("you are not part of this order");
      if (!order.shipping) throw conflict("shipping address is missing");
      const changed = await tx.order.updateMany({
        where: { id: orderId, version, status: "confirmed" },
        data: { status: "shipped", version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw conflict("order changed or is not awaiting shipment");
      await tx.shipping.update({
        where: { orderId },
        data: {
          company: company.trim(),
          trackingNumber: trackingNumber.trim(),
          status: "shipped",
        },
      });
      await tx.orderLog.create({
        data: {
          orderId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          actorId,
          action: "SHIPPED",
          detail: JSON.stringify({
            company: company.trim(),
            trackingNumber: trackingNumber.trim(),
          }),
        },
      });
      const model = require("../../models/orderModel");
      return model.view(
        await tx.order.findUnique({
          where: { id: orderId },
          include: model.INCLUDE,
        }),
      );
    });
  }
  return { updateAddress, markShipped };
}

module.exports = { createShippingService, normalizeAddress };
