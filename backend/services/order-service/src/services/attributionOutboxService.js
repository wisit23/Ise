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
      grossAmount: Number(event.grossAmount),
      discountAmount: Number(event.discountAmount),
      netAmount: Number(event.netAmount),
      completedAt: (event.completedAt || new Date()).toISOString(),
    },
    // Top-level flat compatibility properties
    orderId: event.orderId,
    campaignId: event.campaignId,
    grossAmount: Number(event.grossAmount),
    discountAmount: Number(event.discountAmount),
    netAmount: Number(event.netAmount),
    completedAt: (event.completedAt || new Date()).toISOString(),
  };

  return client.recordOrderCompleted(payload);
}

function assertQueue(db) {
  if (!db?.attributionJob || !db?.orderLog)
    throw new Error(
      "attributionJob table and orderLog model are required on Prisma client",
    );
}
async function appendResult(db, event, action, detail) {
  return db.$transaction(async (tx) => {
    const patch = { ...detail };
    delete patch.attempts;
    const changed = await tx.attributionJob.updateMany({
      where: { id: event.id, processedAt: null },
      data: {
        ...patch,
        attempts: { increment: 1 },
        ...(action === "ATTRIBUTION_ACK" ? { lastError: null } : {}),
      },
    });
    if (!changed.count) return;
    const order = await tx.order.findUnique({ where: { id: event.orderId } });
    const state = await tx.attributionJob.findUnique({
      where: { id: event.id },
    });
    await tx.orderLog.create({
      data: {
        ...(action === "ATTRIBUTION_ACK" ? { id: `${event.id}:ack` } : {}),
        orderId: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        actorId: order.buyerId,
        action,
        detail: JSON.stringify({
          schema_version: 1,
          eventId: event.id,
          ...detail,
          attempts: state.attempts,
        }),
      },
    });
  });
}
async function processEvent(
  eventId,
  { db = prisma, client = productClient, now = new Date() } = {},
) {
  assertQueue(db);
  const event = await db.attributionJob.findUnique({ where: { id: eventId } });
  if (!event || event.processedAt) return event;
  try {
    await deliver(event, client);
  } catch (error) {
    await appendResult(db, event, "ATTRIBUTION_RETRY", {
      attempts: event.attempts + 1,
      lastError: String(error?.message || error).slice(0, 1000),
      nextAttemptAt: new Date(now.getTime() + retryDelayMs(event.attempts)),
    });
    throw error;
  }
  // A crash after Product accepts but before this append leaves the same
  // durable job pending. Restart reuses its ID, never a new attribution ID.
  await appendResult(db, event, "ATTRIBUTION_ACK", {
    attempts: event.attempts + 1,
    processedAt: now,
  });
  return db.attributionJob.findUnique({ where: { id: event.id } });
}

async function processPendingEvents({
  db = prisma,
  client = productClient,
  now = new Date(),
  take = MAX_BATCH_SIZE,
} = {}) {
  assertQueue(db);
  const events = await db.attributionJob.findMany({
    where: { processedAt: null, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take,
  });

  return Promise.allSettled(
    events.map((event) => processEvent(event.id, { db, client, now })),
  );
}

async function findPendingForOrder(orderId, db = prisma) {
  assertQueue(db);
  return db.attributionJob.findFirst({
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
