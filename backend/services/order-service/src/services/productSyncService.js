const prisma = require("../models/prismaClient");
const productClient = require("./productClient");

const ACTIONS = Object.freeze({
  COMPLETE_RESERVATION: "COMPLETE_RESERVATION",
  RELEASE_RESERVATION: "RELEASE_RESERVATION",
  SET_STATUS: "SET_STATUS",
});

const RETRY_INTERVAL_MS = 15_000;
const MAX_BATCH_SIZE = 25;

async function deliver(event, client = productClient) {
  if (event.action === ACTIONS.COMPLETE_RESERVATION) {
    return client.completeProductReservation(
      event.productId,
      event.reservationId,
    );
  }
  if (event.action === ACTIONS.RELEASE_RESERVATION) {
    return client.releaseProductReservation(
      event.productId,
      event.reservationId,
    );
  }
  if (event.action === ACTIONS.SET_STATUS) {
    return client.setProductStatus(event.productId, event.targetStatus);
  }
  throw new Error(`unsupported product sync action: ${event.action}`);
}

function retryDelayMs(attempts) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

async function processEvent(
  eventId,
  { db = prisma, client = productClient, now = new Date() } = {},
) {
  const event = await db.productSyncEvent.findUnique({
    where: { id: eventId },
  });
  if (!event || event.processedAt) return event;

  try {
    await deliver(event, client);
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await db.productSyncEvent.updateMany({
      where: { id: event.id, processedAt: null },
      data: {
        attempts: { increment: 1 },
        lastError: message,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(event.attempts)),
      },
    });
    throw error;
  }

  await db.productSyncEvent.updateMany({
    where: { id: event.id, processedAt: null },
    data: {
      attempts: { increment: 1 },
      lastError: null,
      processedAt: now,
    },
  });
  return db.productSyncEvent.findUnique({ where: { id: event.id } });
}

async function processPendingEvents({
  db = prisma,
  client = productClient,
  now = new Date(),
  take = MAX_BATCH_SIZE,
} = {}) {
  const events = await db.productSyncEvent.findMany({
    where: { processedAt: null, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take,
  });
  return Promise.allSettled(
    events.map((event) => processEvent(event.id, { db, client, now })),
  );
}

async function findPendingForOrder(orderId, db = prisma) {
  return db.productSyncEvent.findFirst({
    where: { orderId, processedAt: null },
    orderBy: { createdAt: "desc" },
  });
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
  const timer = setInterval(sweep, RETRY_INTERVAL_MS);
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
