const { AppError, badRequest, conflict, forbidden, notFound } = require("@reloop/shared");

// Real carrier numbers are 8–20 letters/digits with at least one digit:
// TH123456789TH, KER1234567890, or all-digit J&T numbers. This keeps out
// keyboard mash like "fhfueueduejdeudhe", "----" or "TH12".
// Mirrored in frontend/lib/orders.js.
const TRACKING_NUMBER_PATTERN = /^(?=.*[0-9])[A-Za-z0-9]{8,20}$/;
const TRACKING_NUMBER_MESSAGE =
  "เลขพัสดุต้องยาว 8–20 ตัว มีตัวเลขอย่างน้อย 1 ตัว และใช้ได้เฉพาะตัวอักษรภาษาอังกฤษหรือตัวเลข";

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
      if (field === "phone" && !value.startsWith("0")) {
        throw badRequest("เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก และต้องขึ้นต้นด้วย 0");
      }
      if (field === "postalCode" && !/^[0-9]{5}$/.test(value)) {
        throw badRequest("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");
      }
      if (!value) throw badRequest(`shippingAddress.${field} is required`);
      return [field, value];
    }),
  );
}

// Existing Auth address-list API validates the buyer's bearer identity. Never
// substitute a default address or trust a shippingAddress supplied by a client.
async function resolveSelectedAddress({ buyerId, addressId, authorization }) {
  if (!authorization) throw forbidden("buyer authorization is required to select an address");
  let response;
  try {
    response = await fetch(`${process.env.AUTH_SERVICE_URL || "http://auth-service:3001"}/me/addresses`, {
      headers: { authorization }, signal: AbortSignal.timeout(5000),
    });
  } catch { throw new AppError(502, "address service is unavailable"); }
  if (response.status === 401 || response.status === 403) throw forbidden("address access denied");
  if (!response.ok) throw new AppError(502, "address service returned an error");
  const rows = await response.json();
  const selected = rows.find((row) => row.id === addressId && row.userId === buyerId);
  if (!selected) throw notFound("selected address does not belong to this buyer");
  return normalizeAddress(selected);
}

// Once the seller has packed the parcel the address is printed on it.
const ADDRESS_EDITABLE_STATUSES = ["paid", "confirmed"];

function createShippingService(db, addresses = resolveSelectedAddress) {
  async function updateAddress({
    orderId,
    buyerId,
    addressId,
    authorization,
    version,
  }) {
    if (typeof addressId !== "string" || !addressId.trim()) {
      throw badRequest("addressId is required");
    }
    const addressSnapshot = await addresses({ buyerId, addressId: addressId.trim(), authorization });
    return db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipping: true },
      });
      if (!order) throw notFound("order not found");
      if (order.buyerId !== buyerId)
        throw forbidden("only the buyer can change the shipping address");
      if (
        !ADDRESS_EDITABLE_STATUSES.includes(order.status) ||
        !order.shipping ||
        ["pickup_in_progress", "in_transit", "delivered"].includes(order.shipping.status)
      ) {
        throw conflict(
          "the address can only change before the seller prepares the parcel",
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
          status: { in: ADDRESS_EDITABLE_STATUSES },
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
  async function saveShipping({
    orderId,
    actorId,
    version,
    status,
    company,
    trackingNumber,
  }, editing = false) {
    if (!["pickup_in_progress", "in_transit"].includes(status))
      throw badRequest("invalid shipping transition");
    const handoff = status === "in_transit";
    return db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipping: true, dispute: true, payments: { include: { holds: true } } },
      });
      if (!order) throw notFound("order not found");
      if (order.sellerId !== actorId)
        throw forbidden("only the seller can ship this order");
      const model = require("../../models/orderModel");
      require("../../services/orderTransitionService").assertCanParticipantUpdateStatus(model.view(order));
      if (order.dispute && !order.dispute.deletedAt && !order.dispute.decision)
        throw conflict("cannot update status while order has an open dispute");
      if (!order.shipping) throw conflict("shipping address is missing");
      const expectedStatuses = editing || handoff ? ["pickup_in_progress"] : ["confirmed", "ready_to_ship"];
      if (!expectedStatuses.includes(order.status))
        throw conflict(`cannot change order from ${order.status} to ${status}`);
      // Reuse saved details at handoff; legacy pickup orders can fill missing data.
      const carrier = company ?? (handoff ? order.shipping.company : undefined);
      const tracking = trackingNumber ?? (handoff ? order.shipping.trackingNumber : undefined);
      if (typeof carrier !== "string" || !carrier.trim() ||
          typeof tracking !== "string" || !tracking.trim()) {
        throw badRequest("company and trackingNumber are required before requesting pickup or handing over the parcel");
      }
      if (!TRACKING_NUMBER_PATTERN.test(tracking.trim())) {
        throw badRequest(TRACKING_NUMBER_MESSAGE);
      }
      const shippingDetails = { company: carrier.trim(), trackingNumber: tracking.trim() };
      if (version !== undefined && version !== order.version)
        throw conflict("order was modified — reload and retry");
      const changed = await tx.order.updateMany({
        where: { id: orderId, version: order.version, status: order.status },
        data: { ...(!editing ? { status } : {}), ...(handoff ? { shippedAt: new Date() } : {}), version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw conflict("order changed or is not awaiting shipment");
      await tx.shipping.update({
        where: { orderId },
        data: {
          ...(!editing ? { status } : {}),
          ...shippingDetails,
        },
      });
      await tx.orderLog.create({
        data: {
          orderId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          actorId,
          action: editing ? "SHIPPING_DETAILS_CHANGED" : handoff ? "IN_TRANSIT" : "PICKUP_REQUESTED",
          detail: JSON.stringify({
            from: order.status,
            to: status,
            ...shippingDetails,
            ...(editing ? { before: { company: order.shipping.company, trackingNumber: order.shipping.trackingNumber } } : {}),
          }),
        },
      });
      return model.view(
        await tx.order.findUnique({
          where: { id: orderId },
          include: model.INCLUDE,
        }),
      );
    });
  }
  return {
    updateAddress,
    advanceShipping: (input) => saveShipping(input),
    updateDetails: (input) => saveShipping({ ...input, status: "pickup_in_progress" }, true),
  };
}

module.exports = { createShippingService, normalizeAddress, resolveSelectedAddress };
