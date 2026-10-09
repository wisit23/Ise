const prisma = require("../models/prismaClient");
const productClient = require("./productClient");
const ACTIONS = Object.freeze({
  COMPLETE_RESERVATION: "COMPLETE_RESERVATION",
  RELEASE_RESERVATION: "RELEASE_RESERVATION",
  SET_STATUS: "SET_STATUS",
});
const REQUEST = "PRODUCT_SYNC_REQUESTED";
const COMPLETE = "PRODUCT_SYNC_COMPLETED";
async function processEvent(
  eventId,
  { db = prisma, client = productClient } = {},
) {
  const event = await db.orderLog.findUnique({ where: { id: eventId } });
  if (
    !event ||
    event.action !== REQUEST ||
    (await db.orderLog.findFirst({
      where: { action: COMPLETE, detail: eventId },
    }))
  )
    return event;
  const data = JSON.parse(event.detail);
  if (data.action === ACTIONS.COMPLETE_RESERVATION)
    await client.completeProductReservation(data.productId, data.reservationId);
  else if (data.action === ACTIONS.RELEASE_RESERVATION)
    await client.releaseProductReservation(data.productId, data.reservationId);
  else if (data.action === ACTIONS.SET_STATUS)
    await client.setProductStatus(data.productId, data.targetStatus);
  else throw new Error("unsupported product sync action: " + data.action);
  await db.orderLog.create({
    data: {
      orderId: event.orderId,
      buyerId: event.buyerId,
      sellerId: event.sellerId,
      actorId: event.actorId,
      action: COMPLETE,
      detail: event.id,
    },
  });
  return event;
}
async function pending(db, orderId) {
  const [requests, completions] = await Promise.all([
    db.orderLog.findMany({
      where: { action: REQUEST, ...(orderId ? { orderId } : {}) },
      orderBy: { createdAt: "asc" },
    }),
    db.orderLog.findMany({
      where: { action: COMPLETE, ...(orderId ? { orderId } : {}) },
      select: { detail: true },
    }),
  ]);
  const complete = new Set(completions.map((row) => row.detail));
  return requests.filter((row) => !complete.has(row.id));
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
    (await pending(db))
      .slice(0, take)
      .map((event) => processEvent(event.id, { db, client })),
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
  processEvent,
  processPendingEvents,
  findPendingForOrder,
  startWorker,
};
