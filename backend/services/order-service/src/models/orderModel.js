const { conflict } = require("@reloop/shared");
const prisma = require("./prismaClient");
const { money } = require("./money");
const evidenceModel = require("../features/disputes/evidenceView");
const { assertCanCancelOrder } = require("../services/orderTransitionService");
const VALID_STATUSES = [
  "pending",
  "pending_payment",
  "confirmed",
  "shipped",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
];
const INCLUDE = {
  basket: true,
  checkout: true,
  shipping: true,
  dispute: { include: { evidence: { include: evidenceModel.INCLUDE } } },
  payments: { include: { holds: true } },
};
function disputeView(row) {
  if (!row) return null;
  return {
    ...row,
    ...(row.evidence ? { evidence: row.evidence.map(evidenceModel.view) } : {}),
    openedBy: row.createdBy,
    claimedAt: row.assignedAt,
    status: row.decision
      ? "DECIDED"
      : row.evidence?.some((e) => e.status === "NEEDS_INFO")
        ? "NEEDS_INFO"
        : row.status || "OPEN",
  };
}
function view(row) {
  if (!row) return null;
  const holds = (row.payments || []).flatMap((p) => p.holds || []);
  const active = holds.filter((h) => !h.releaseAt);
  return {
    ...row,
    price: Number(row.originalAmount),
    finalPrice: Number(row.ordersAmount),
    discountAmount: Number(money(row.originalAmount).minus(row.ordersAmount)),
    checkoutSessionId: row.checkoutId,
    checkoutSession: row.checkout ? {...row.checkout,shippingAddress:row.shipping?.addressSnapshot || row.checkout.addressSnapshot} : null,
    shippingAddress:row.shipping?.addressSnapshot || row.checkout?.addressSnapshot || null,
    reservationId: row.basketId,
    reservationExpiresAt: row.basket?.unlockAt || null,
    auctionId: row.auctionId || (row.orderType === "AUCTION" ? row.id : null),
    dispute: row.dispute?.deletedAt ? null : disputeView(row.dispute),
    holds,
    heldBy: active[0]?.holdBy || null,
    heldAt: active[0]?.holdAt || null,
    holdReason: active[0]?.holdReason || null,
    payoutHeld: active.length > 0,
    paymentSimulationStatus: active.length ? "ON_HOLD" : "RELEASE_PENDING",
  };
}
async function create(data) {
  return view(await prisma.order.create({ data, include: INCLUDE }));
}
async function findById(id) {
  return view(
    await prisma.order.findUnique({ where: { id }, include: INCLUDE }),
  );
}
async function findByReservationId(basketId) {
  return view(
    await prisma.order.findUnique({ where: { basketId }, include: INCLUDE }),
  );
}
async function list(where, { skip, take } = {}) {
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);
  return { items: items.map(view), total };
}
function statusFilter(status) {
  return status === "pending_payment"
    ? { in: ["pending", "pending_payment"] }
    : status;
}
function listByBuyer(buyerId, options = {}) {
  const { status } = options;
  return list(
    {
      buyerId,
      ...(status ? { status: statusFilter(status) } : {}),
      ...(status === "pending_payment"
        ? {
            OR: [
              { basketId: null },
              { basket: { unlockAt: { gt: new Date() } } },
            ],
          }
        : {}),
    },
    options,
  );
}
function listBySeller(sellerId, options = {}) {
  return list(
    {
      sellerId,
      ...(options.status ? { status: statusFilter(options.status) } : {}),
    },
    options,
  );
}
function logData(order, actorId, action, detail) {
  return {
    orderId: order.id,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    actorId,
    action,
    detail: typeof detail === "string" ? detail : JSON.stringify(detail),
  };
}
async function updateStatus(id, status, expectedVersion, actorId) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) return null;
    const claimed = await tx.order.updateMany({
      where: { id, version: expectedVersion ?? order.version },
      data: { status, version: { increment: 1 } },
    });
    if (claimed.count !== 1)
      throw conflict("order was modified concurrently — reload and retry");
    await tx.orderLog.create({
      data: logData(order, actorId || order.buyerId, "STATUS_CHANGED", {
        from: order.status,
        to: status,
      }),
    });
    return view(await tx.order.findUnique({ where: { id }, include: INCLUDE }));
  });
}
async function updateCampaign(id, { campaignId, finalPrice }) {
  return view(
    await prisma.order.update({
      where: { id },
      data: { campaignId, ordersAmount: money(finalPrice) },
      include: INCLUDE,
    }),
  );
}
async function transitionStatusWithProductSync({
  id,
  status,
  expectedVersion,
  expectedStatuses,
  productSync,
  actorId,
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!before) return { order: null, event: null };
    if (status === "cancelled") assertCanCancelOrder(before);
    const claimed = await tx.order.updateMany({
      where: {
        id,
        version: expectedVersion,
        ...(expectedStatuses ? { status: { in: expectedStatuses } } : {}),
      },
      data: { status, version: { increment: 1 } },
    });
    if (claimed.count !== 1)
      throw conflict("order was modified concurrently — reload and retry");
    if (status === "confirmed")
      await tx.payment.create({
        data: {
          orderId: id,
          paymentType: "SIMULATED",
          paymentStatus: "paid",
          paymentAmount: before.ordersAmount,
          paidAt: new Date(),
        },
      });
    const event = await require("../services/productSyncService").createRequest(
      tx,
      before,
      actorId || before.buyerId,
      productSync,
    );
    if (status === "cancelled" && before.basketId)
      await tx.basket.update({
        where: { id: before.basketId },
        data: { status: "cancelled" },
      });
    await tx.orderLog.create({
      data: logData(before, actorId || before.buyerId, "STATUS_CHANGED", {
        from: before.status,
        to: status,
      }),
    });
    let attributionEvent = null;
    if (status === "completed" && before.campaignId) {
      attributionEvent = await tx.attributionJob.findUnique({
        where: { orderId: id },
      });
      if (!attributionEvent) {
        attributionEvent = await tx.attributionJob.create({
          data: {
            orderId: id,
            campaignId: before.campaignId,
            grossAmount: before.originalAmount,
            discountAmount: money(before.originalAmount).minus(
              before.ordersAmount,
            ),
            netAmount: before.ordersAmount,
            completedAt: new Date(),
            attempts: 0,
            nextAttemptAt: new Date(),
            createdAt: new Date(),
          },
        });
        await tx.orderLog.create({
          data: logData(
            before,
            actorId || before.buyerId,
            "ATTRIBUTION_REQUESTED",
            {
              eventId: attributionEvent.id,
              campaignId: before.campaignId,
              grossAmount: before.originalAmount.toString(),
              discountAmount: attributionEvent.discountAmount.toString(),
              netAmount: before.ordersAmount.toString(),
              completedAt: attributionEvent.completedAt,
            },
          ),
        });
      }
    }
    return {
      order: view(
        await tx.order.findUnique({ where: { id }, include: INCLUDE }),
      ),
      event,
      attributionEvent,
    };
  });
}
async function cleanExpiredOrders(productClient) {
  const expired = await prisma.order.findMany({
    where: {
      status: { in: ["pending", "pending_payment"] },
      basket: { unlockAt: { lte: new Date() } },
    },
    include: INCLUDE,
  });
  let cleaned = 0;
  for (const row of expired) {
    const order = view(row);
    const { event } = await transitionStatusWithProductSync({
      id: order.id,
      status: "cancelled",
      expectedVersion: order.version,
      expectedStatuses: ["pending", "pending_payment"],
      productSync: {
        action: "RELEASE_RESERVATION",
        productId: order.productId,
        reservationId: order.basketId,
      },
    });
    if (order.campaignId)
      await productClient.releaseVoucher(order.campaignId, {
        userId: order.buyerId,
        orderId: order.id,
      });
    await require("../services/productSyncService").processEvent(event.id);
    cleaned++;
  }
  return cleaned;
}
module.exports = {
  create,
  findById,
  findByReservationId,
  listByBuyer,
  listBySeller,
  updateStatus,
  updateCampaign,
  cleanExpiredOrders,
  transitionStatusWithProductSync,
  VALID_STATUSES,
  INCLUDE,
  view,
  disputeView,
  logData,
};
