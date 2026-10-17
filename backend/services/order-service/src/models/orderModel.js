const { conflict } = require("@reloop/shared");
const prisma = require("./prismaClient");
const { money } = require("./money");
const evidenceModel = require("../features/disputes/evidenceView");
const { assertCanCancelOrder } = require("../services/orderTransitionService");
const { isRefundingCancellation } = require("../services/orderLifecycle");
const VALID_STATUSES = [
  "pending",
  "pending_payment",
  "paid",
  "confirmed",
  "ready_to_ship",
  "shipped",
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
    reservationExpiresAt:
      row.basket?.unlockAt ||
      (row.orderType === "AUCTION" ? row.paymentDeadlineAt : null),
    auctionId: row.auctionId || (row.orderType === "AUCTION" ? row.id : null),
    dispute: disputeView(row.dispute),
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
          status: { in: ["pending", "pending_payment"] },
          paymentDeadlineAt: { lte: now },
        },
        {
          status: "cancelled",
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
      !["pending", "pending_payment"].includes(before.status) ||
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
        status: { in: ["pending", "pending_payment"] },
        paymentDeadlineAt: { lte: now },
      },
      data: { status: "cancelled", version: { increment: 1 } },
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

async function reassignAuctionOrder({
  id,
  expectedVersion,
  buyerId,
  auctionBidId,
  price,
  paymentDeadlineAt,
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUnique({ where: { id }, include: INCLUDE });
    if (!before) return null;
    const claimed = await tx.order.updateMany({
      where: {
        id,
        version: expectedVersion ?? before.version,
        status: "cancelled",
        orderType: "AUCTION",
      },
      data: {
        buyerId,
        auctionBidId,
        originalAmount: money(price),
        ordersAmount: money(price),
        paymentDeadlineAt,
        status: "pending_payment",
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    await tx.orderLog.create({
      data: logData(before, "SYSTEM", "AUCTION_WINNER_REASSIGNED", {
        previousBuyerId: before.buyerId,
        buyerId,
        auctionBidId,
        price,
        paymentDeadlineAt,
      }),
    });
    return view(await tx.order.findUnique({ where: { id }, include: INCLUDE }));
  });
}

async function finalizeAuctionOrderWithoutWinner({ id, expectedVersion }) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUnique({ where: { id }, include: INCLUDE });
    if (!before) return null;
    const claimed = await tx.order.updateMany({
      where: {
        id,
        version: expectedVersion ?? before.version,
        status: "cancelled",
        orderType: "AUCTION",
      },
      data: {
        auctionBidId: null,
        paymentDeadlineAt: null,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    await tx.orderLog.create({
      data: logData(before, "SYSTEM", "AUCTION_NO_PAYING_BIDDER", {
        auctionId: before.auctionId,
      }),
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
  shipped: "shippedAt",
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
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!before) return { order: null, event: null };
    const refunding = isRefundingCancellation(before, status);
    if (status === "cancelled" && !refunding) assertCanCancelOrder(before);
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
  findAuctionOrdersDueForSettlement,
  claimExpiredAuctionOrder,
  reassignAuctionOrder,
  finalizeAuctionOrderWithoutWinner,
  transitionStatusWithProductSync,
  VALID_STATUSES,
  INCLUDE,
  view,
  disputeView,
  logData,
  statusData,
};
