const prisma = require("../models/prismaClient");
const productClient = require("./productClient");

const RETRY_INTERVAL_MS = 15_000;
const MAX_BATCH_SIZE = 25;

function retryDelayMs(attempts) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

async function deliver(event, client = productClient) {
  const payload = {
    eventId: event.id,
    eventType: "order.completed.v1",
    occurredAt: (event.completedAt || new Date()).toISOString(),
    aggregateId: event.orderId,
    payload: {
      orderId: event.orderId,
      campaignId: event.campaignId,
      grossAmount: event.grossAmount,
      discountAmount: event.discountAmount,
      netAmount: event.netAmount,
      completedAt: (event.completedAt || new Date()).toISOString(),
    },
    // Top-level flat compatibility properties
    orderId: event.orderId,
    campaignId: event.campaignId,
    grossAmount: event.grossAmount,
    discountAmount: event.discountAmount,
    netAmount: event.netAmount,
    completedAt: (event.completedAt || new Date()).toISOString(),
  };

  return client.recordOrderCompleted(payload);
}

async function processEvent(
  eventId,
  { db = prisma, client = productClient, now = new Date() } = {},
) {
  if (!db || !db.attributionOutboxEvent) {
    throw new Error(
      "attributionOutboxEvent model is required on Prisma client",
    );
  }

  const event = await db.attributionOutboxEvent.findUnique({
    where: { id: eventId },
  });
  if (!event || event.processedAt) return event;

  try {
    await deliver(event, client);
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await db.attributionOutboxEvent.updateMany({
      where: { id: event.id, processedAt: null },
      data: {
        attempts: { increment: 1 },
        lastError: message,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(event.attempts)),
      },
    });
    throw error;
  }

  await db.attributionOutboxEvent.updateMany({
    where: { id: event.id, processedAt: null },
    data: {
      attempts: { increment: 1 },
      lastError: null,
      processedAt: now,
    },
  });

  return db.attributionOutboxEvent.findUnique({ where: { id: event.id } });
}

async function processPendingEvents({
  db = prisma,
  client = productClient,
  now = new Date(),
  take = MAX_BATCH_SIZE,
} = {}) {
  if (!db || !db.attributionOutboxEvent) {
    throw new Error(
      "attributionOutboxEvent model is required on Prisma client",
    );
  }

  const events = await db.attributionOutboxEvent.findMany({
    where: { processedAt: null, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take,
  });

  return Promise.allSettled(
    events.map((event) => processEvent(event.id, { db, client, now })),
  );
}

async function findPendingForOrder(orderId, db = prisma) {
  if (!db || !db.attributionOutboxEvent) {
    throw new Error(
      "attributionOutboxEvent model is required on Prisma client",
    );
  }
  return db.attributionOutboxEvent.findFirst({
    where: { orderId, processedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

let workerTimer = null;
let running = false;

function startWorker({
  intervalMs = RETRY_INTERVAL_MS,
  db = prisma,
  client = productClient,
} = {}) {
  if (workerTimer) return workerTimer;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      await processPendingEvents({ db, client });
    } catch (error) {
      console.error("[order-service] attribution outbox sweep failed", error);
    } finally {
      running = false;
    }
  };
  void sweep();
  workerTimer = setInterval(sweep, intervalMs);
  workerTimer.unref();
  return workerTimer;
}

function stopWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

module.exports = {
  deliver,
  retryDelayMs,
  processEvent,
  processPendingEvents,
  findPendingForOrder,
  startWorker,
  stopWorker,
};
