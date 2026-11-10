const { customerServiceRuntime } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const SUPPORT_SERVICE_URL = () =>
  process.env.SUPPORT_SERVICE_URL || "http://support-service:3006";
const INTERNAL_TOKEN = () => process.env.INTERNAL_SERVICE_TOKEN || "";

const INITIAL_BACKOFF_MS = customerServiceRuntime.syncInitialBackoffMs;
const MAX_BACKOFF_MS = customerServiceRuntime.syncMaxBackoffMs;
const REQUEST_TIMEOUT_MS = customerServiceRuntime.chatTimeoutMs;

function calculateBackoffMs(attempts) {
  const exponent = Math.max(0, Math.min(attempts - 1, 16));
  return Math.min(INITIAL_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
}

async function deliverMessage(
  conversation,
  message,
  { timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  if (!conversation || conversation.contextType !== "SUPPORT") return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${SUPPORT_SERVICE_URL()}/internal/chat-events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": INTERNAL_TOKEN(),
        },
        signal: controller.signal,
        body: JSON.stringify({
          ticketId: conversation.contextId,
          conversationId: conversation.id,
          chatMessageId: message.id,
          authorId: message.senderId,
          authorRole: message.senderRole,
          type: message.type,
          isInternal: message.visibility === "INTERNAL",
          createdAt: message.createdAt,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`support-service returned ${response.status}`);
    }

    await prisma.message.update({
      where: { id: message.id },
      data: {
        syncStatus: "SYNCED",
        syncedAt: new Date(),
        nextRetryAt: null,
        lastSyncError: null,
      },
    });
    return true;
  } catch (error) {
    const attempts = (message.syncAttempts || 0) + 1;
    await prisma.message.update({
      where: { id: message.id },
      data: {
        // Never discard a persisted support message after an arbitrary
        // attempt limit. Backoff is capped, while attempts remain visible.
        syncStatus: "PENDING",
        syncAttempts: attempts,
        nextRetryAt: new Date(Date.now() + calculateBackoffMs(attempts)),
        lastSyncError: error.message,
      },
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function claimMessage(message) {
  if (!["PENDING", "FAILED"].includes(message.syncStatus)) return false;
  const now = new Date();
  const result = await prisma.message.updateMany({
    where: {
      id: message.id,
      syncStatus: message.syncStatus,
      AND: [
        {
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { isSet: false } },
            { nextRetryAt: { lte: now } },
          ],
        },
        {
          OR: [
            { nextRetryAt: message.nextRetryAt ?? null },
            ...(message.nextRetryAt == null
              ? [{ nextRetryAt: { isSet: false } }]
              : []),
          ],
        },
      ],
    },
    data: { nextRetryAt: new Date(now.getTime() + REQUEST_TIMEOUT_MS + 30000) },
  });
  return result.count === 1;
}

async function syncSupportMessage(conversation, message) {
  if (!conversation || conversation.contextType !== "SUPPORT") return;
  try {
    if (await claimMessage(message))
      await deliverMessage(conversation, message);
  } catch (error) {
    // The message was persisted as PENDING before this call. A failure to
    // update retry metadata must not turn into an unhandled rejection.
    console.error(
      `[support-sync] immediate delivery failed for ${message.id}: ${error.message}`,
    );
  }
}

async function replayFailedMessages() {
  const result = await prisma.message.updateMany({
    where: { syncStatus: "FAILED" },
    data: { syncStatus: "PENDING", nextRetryAt: new Date() },
  });
  return result.count;
}

async function processPendingMessages({ limit = 50 } = {}) {
  const messages = await prisma.message.findMany({
    where: {
      syncStatus: { in: ["PENDING", "FAILED"] },
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { isSet: false } },
        { nextRetryAt: { lte: new Date() } },
      ],
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let synced = 0;
  for (const message of messages) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: message.conversationId },
    });
    if (!conversation) continue;
    // Compare-and-set the retry timestamp: only one replica owns this attempt.
    // A crashed owner leaves a bounded lease, not a permanently stuck message.
    if (!(await claimMessage(message))) continue;
    if (await deliverMessage(conversation, message)) synced += 1;
  }
  return { processed: messages.length, synced };
}

let workerTimer = null;

function startSupportSyncWorker(
  intervalMs = customerServiceRuntime.syncPollIntervalMs,
) {
  if (!workerTimer)
    workerTimer = require("@reloop/shared").startPeriodicTask(
      processPendingMessages,
      intervalMs,
      {
        onError: (error) =>
          console.error("[support-sync] retry poll failed:", error.message),
      },
    );
  return workerTimer;
}

async function stopSupportSyncWorker() {
  const current = workerTimer;
  workerTimer = null;
  await current?.stop();
}

module.exports = {
  calculateBackoffMs,
  deliverMessage,
  processPendingMessages,
  replayFailedMessages,
  startSupportSyncWorker,
  stopSupportSyncWorker,
  syncSupportMessage,
};
