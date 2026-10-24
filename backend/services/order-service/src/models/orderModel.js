const { conflict } = require("@reloop/shared");
const prisma = require("./prismaClient");
const { money } = require("./money");
const evidenceModel = require("../features/disputes/evidenceView");
const { isSellerVisible } = require("../features/disputes/sellerVisibility");
const { assertCanCancelOrder, assertCanParticipantUpdateStatus } = require("../services/orderTransitionService");
const { isRefundingCancellation } = require("../services/orderLifecycle");
const VALID_STATUSES = [
  "pending_payment",
  "payment_expired",
  "seller_confirmation_expired",
  "paid",
  "confirmed",
  "ready_to_ship",
  "pickup_in_progress",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
];
const INCLUDE = {
  basket: true,
  checkout: true,
  shipping: true,
  dispute: { include: { evidence: { include: evidenceModel.INCLUDE }, caseLog: true } },
  payments: { include: { holds: true } },
  logs: { where: { action: "STATUS_CHANGED" }, orderBy: { createdAt: "desc" }, take: 1, select: { detail: true } },
};
function disputeView(row) {
  if (!row) return null;
  const fields = { ...row };
  delete fields.caseLog;
  return {
    ...fields,
    sellerVisible: isSellerVisible(row),
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
  const { logs, ...fields } = row;
  let cancellationReason = null;
  if (row.status === "cancelled" && logs?.[0]?.detail) {
    try {
      const detail = JSON.parse(logs[0].detail);
      if (detail.to === "cancelled" && typeof detail.reason === "string")
        cancellationReason = detail.reason.trim() || null;
    } catch {
      // Legacy audit entries may not contain structured cancellation details.
    }
  }
  const holds = (row.payments || []).flatMap((p) => p.holds || []);
  const active = holds.filter((h) => !h.releaseAt);
  return {
    ...fields,
    cancellationReason,
    price: Number(row.originalAmount),
    finalPrice: Number(row.ordersAmount),
    discountAmount: Number(money(row.originalAmount).minus(row.ordersAmount)),
    checkoutSessionId: row.checkoutId,
    checkoutSession: row.checkout ? {...row.checkout,shippingAddress:row.shipping?.addressSnapshot || row.checkout.addressSnapshot} : null,
    shippingAddress:row.shipping?.addressSnapshot || row.checkout?.addressSnapshot || null,
    reservationId: row.basketId,
    reservationExpiresAt:
      row.basket?.unlockAt ||
      (row.orderType === "AUCTION" ? row.paymentDeadlineAt : null),
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

async function createAuctionOrder(data, { previousOrderId = null } = {}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { id: data.id },
      include: INCLUDE,
    });
    if (existing) return { order: view(existing), created: false };

    const created = await tx.order.create({ data, include: INCLUDE });
    await tx.orderLog.create({
      data: logData(created, "SYSTEM", "AUCTION_ORDER_CREATED", {
        auctionId: created.auctionId,
        auctionBidId: created.auctionBidId,
        previousOrderId,
        paymentDeadlineAt: created.paymentDeadlineAt,
      }),
    });
    return { order: view(created), created: true };
  });
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
  return status;
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
              {
                orderType: "AUCTION",
                paymentDeadlineAt: { gt: new Date() },
              },
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

async function findAuctionOrdersDueForSettlement(now = new Date(), take = 50) {
  const rows = await prisma.order.findMany({
    where: {
      orderType: "AUCTION",
      OR: [
        {
          status: "pending_payment",
          paymentDeadlineAt: { lte: now },
        },
        {
          status: { in: ["payment_expired", "cancelled"] },
          paymentDeadlineAt: { not: null },
        },
      ],
    },
    include: INCLUDE,
    orderBy: [{ paymentDeadlineAt: "asc" }, { createdAt: "asc" }],
    take,
  });
  return rows.map(view);
}

async function claimExpiredAuctionOrder({ id, expectedVersion, now = new Date() }) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUnique({ where: { id }, include: INCLUDE });
    if (!before) return null;
    if (
      before.status !== "pending_payment" ||
      before.orderType !== "AUCTION" ||
      !before.paymentDeadlineAt ||
      before.paymentDeadlineAt > now
    ) {
      return view(before);
    }
    const claimed = await tx.order.updateMany({
      where: {
        id,
        version: expectedVersion ?? before.version,
        status: "pending_payment",
        paymentDeadlineAt: { lte: now },
      },
      data: { status: "payment_expired", version: { increment: 1 } },
    });
    if (claimed.count !== 1) return null;
    await tx.orderLog.create({
      data: logData(before, "SYSTEM", "AUCTION_PAYMENT_EXPIRED", {
        buyerId: before.buyerId,
        auctionBidId: before.auctionBidId,
        paymentDeadlineAt: before.paymentDeadlineAt,
      }),
    });
    return view(await tx.order.findUnique({ where: { id }, include: INCLUDE }));
  });
}

async function finalizeExpiredAuctionOrder({
  id,
  expectedVersion,
  successorOrder = null,
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUnique({ where: { id }, include: INCLUDE });
    if (!before) return null;
    if (
      !["payment_expired", "cancelled"].includes(before.status) ||
      before.orderType !== "AUCTION"
    ) {
      return null;
    }
    if (!before.paymentDeadlineAt) return view(before);

    const claimed = await tx.order.updateMany({
      where: {
        id,
        version: expectedVersion ?? before.version,
        status: { in: ["payment_expired", "cancelled"] },
        orderType: "AUCTION",
        paymentDeadlineAt: { not: null },
      },
      data: {
        paymentDeadlineAt: null,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    await tx.orderLog.create({
      data: logData(
        before,
        "SYSTEM",
        successorOrder
          ? "AUCTION_WINNER_REASSIGNED"
          : "AUCTION_NO_PAYING_BIDDER",
        successorOrder
          ? {
              previousBuyerId: before.buyerId,
              nextBuyerId: successorOrder.buyerId,
              nextOrderId: successorOrder.id,
              nextAuctionBidId: successorOrder.auctionBidId,
              price: successorOrder.price,
              paymentDeadlineAt: successorOrder.paymentDeadlineAt,
            }
          : { auctionId: before.auctionId },
      ),
    });
    return view(await tx.order.findUnique({ where: { id }, include: INCLUDE }));
  });
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
const STATUS_TIMESTAMP = {
  in_transit: "shippedAt",
  delivered: "deliveredAt",
  completed: "completedAt",
};
function statusData(status, now = new Date()) {
  const field = STATUS_TIMESTAMP[status];
  return { status, version: { increment: 1 }, ...(field ? { [field]: now } : {}) };
}
async function transitionStatusWithProductSync({
  id,
  status,
  expectedVersion,
  expectedStatuses,
  productSync,
  actorId,
  reason,
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!before) return { order: null, event: null };
    const refunding = isRefundingCancellation(before, status) &&
      (actorId === before.sellerId ||
        (actorId === before.buyerId && before.status === "paid") ||
        (actorId === "system" && before.status === "paid"));
    if (["cancelled", "payment_expired"].includes(status) && !refunding)
      assertCanCancelOrder(before);
    if (refunding) assertCanParticipantUpdateStatus(view(before));
    const now = new Date();
    const claimed = await tx.order.updateMany({
      where: {
        id,
        version: expectedVersion,
        ...(expectedStatuses ? { status: { in: expectedStatuses } } : {}),
      },
      data: statusData(status, now),
    });
    if (claimed.count !== 1)
      throw conflict("order was modified concurrently — reload and retry");
    // Simulated refund: no money moves, the payment history records it.
    if (refunding)
      await tx.payment.create({
        data: {
          orderId: id,
          paymentType: "SIMULATED_REFUND",
          paymentStatus: "refunded",
          paymentAmount: before.ordersAmount,
          paidAt: now,
        },
      });
    if (status === "delivered" && before.shipping)
      await tx.shipping.update({
        where: { orderId: id },
        data: { status: "delivered" },
      });
    const event = productSync
      ? await require("../services/productSyncService").createRequest(
          tx,
          before,
          actorId || before.buyerId,
          productSync,
        )
      : null;
    if (["cancelled", "payment_expired", "seller_confirmation_expired"].includes(status) && before.basketId)
      await tx.basket.update({
        where: { id: before.basketId },
        data: { status: status === "cancelled" ? "cancelled" : "expired" },
      });
    await tx.orderLog.create({
      data: logData(before, actorId || before.buyerId, "STATUS_CHANGED", {
        from: before.status,
        to: status,
        ...(status === "cancelled" && reason?.trim() ? { reason: reason.trim() } : {}),
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
      status: "pending_payment",
      basket: { unlockAt: { lte: new Date() } },
    },
    include: INCLUDE,
  });
  let cleaned = 0;
  for (const row of expired) {
    const order = view(row);
    const { event } = await transitionStatusWithProductSync({
      id: order.id,
      status: "payment_expired",
      expectedVersion: order.version,
      expectedStatuses: ["pending_payment"],
      actorId: "system",
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
  createAuctionOrder,
  findById,
  findByReservationId,
  listByBuyer,
  listBySeller,
  updateStatus,
  updateCampaign,
  cleanExpiredOrders,
  findAuctionOrdersDueForSettlement,
  claimExpiredAuctionOrder,
  finalizeExpiredAuctionOrder,
  transitionStatusWithProductSync,
  VALID_STATUSES,
  INCLUDE,
  view,
  disputeView,
  logData,
  statusData,
};
