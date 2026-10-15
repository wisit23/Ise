const prisma = require("../models/prismaClient");
const productClient = require("./productClient");
const ACTIONS = Object.freeze({
  COMPLETE_RESERVATION: "COMPLETE_RESERVATION",
  RELEASE_RESERVATION: "RELEASE_RESERVATION",
  SET_STATUS: "SET_STATUS",
});
const REQUEST = "PRODUCT_SYNC_REQUESTED";
const COMPLETE = "PRODUCT_SYNC_COMPLETED";
async function createRequest(db, order, actorId, data) {
  const job = await db.productSyncJob.create({
    data: {
      orderId: order.id,
      actorId,
      productId: data.productId,
      action: data.action,
      reservationId: data.reservationId ?? null,
      targetStatus: data.targetStatus ?? null,
    },
  });
  await db.orderLog.create({
    data: {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      actorId,
      action: REQUEST,
      detail: JSON.stringify({ eventId: job.id, ...data }),
    },
  });
  return job;
}
async function processEvent(
  eventId,
  { db = prisma, client = productClient } = {},
) {
  const event = await db.productSyncJob.findUnique({ where: { id: eventId } });
  if (!event || event.processedAt) return event;
  if (event.action === ACTIONS.COMPLETE_RESERVATION)
    await client.completeProductReservation(
      event.productId,
      event.reservationId,
    );
  else if (event.action === ACTIONS.RELEASE_RESERVATION)
    await client.releaseProductReservation(
      event.productId,
      event.reservationId,
    );
  else if (event.action === ACTIONS.SET_STATUS)
    await client.setProductStatus(event.productId, event.targetStatus);
  else throw new Error("unsupported product sync action: " + event.action);
  await db.$transaction(async (tx) => {
    const changed = await tx.productSyncJob.updateMany({
      where: { id: event.id, processedAt: null },
      data: { processedAt: new Date() },
    });
    if (!changed.count) return;
    const order = await tx.order.findUnique({ where: { id: event.orderId } });
    await tx.orderLog.create({
      data: {
        orderId: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        actorId: event.actorId,
        action: COMPLETE,
        detail: event.id,
      },
    });
  });
  return event;
}
async function pending(db, orderId, take) {
  return db.productSyncJob.findMany({
    where: { processedAt: null, ...(orderId ? { orderId } : {}) },
    orderBy: { createdAt: "asc" },
    ...(take ? { take } : {}),
  });
}
async function findPendingForOrder(orderId, db = prisma) {
  return (await pending(db, orderId))[0] || null;
}
async function processPendingEvents({
  db = prisma,
  client = productClient,
  take = 25,
} = {}) {
  return Promise.allSettled(
    (await pending(db, undefined, take)).map((event) =>
      processEvent(event.id, { db, client }),
    ),
  );
}
function startWorker() {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      await processPendingEvents();
    } catch (error) {
      console.error("[order-service] product sync sweep failed", error);
    } finally {
      running = false;
    }
  };
  void sweep();
  const timer = setInterval(sweep, 15000);
  timer.unref();
  return timer;
}
module.exports = {
  ACTIONS,
  createRequest,
  processEvent,
  processPendingEvents,
  findPendingForOrder,
  startWorker,
};
