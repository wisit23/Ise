// Exact-time auction closing: instead of waiting for someone to visit the
// auction page after scheduledEndAt (the old "lazy close" behavior — see
// auctionService.maybeAdvance), Marketing scheduling a close time here also
// books a delayed BullMQ job that fires at that exact moment and closes the
// auction (creating the winner's Order) with nobody needing to look at it.
const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const QUEUE_NAME = "auction-close";

// Built lazily on first real use, not at require time — requiring this
// module (e.g. transitively, through auctionService) must never open a
// socket by itself, or unit tests that mock scheduleClose/cancelClose would
// still hang waiting on a Redis connection that isn't there.
let queue = null;
function getQueue() {
  if (!queue) {
    // maxRetriesPerRequest: null is required by BullMQ's own connection.
    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

/**
 * Books (or re-books) the close job for one auction. jobId = auctionId, so
 * scheduling again — e.g. after a resolved edge case — replaces any prior
 * job instead of stacking a duplicate.
 */
async function scheduleClose(auctionId, closeAt) {
  const q = getQueue();
  await q.remove(auctionId).catch(() => {});
  const delay = Math.max(0, new Date(closeAt).getTime() - Date.now());
  await q.add("close", { auctionId }, { jobId: auctionId, delay });
}

/** Cancelling an auction before it opens must also cancel its close job. */
async function cancelClose(auctionId) {
  await getQueue()
    .remove(auctionId)
    .catch(() => {});
}

/**
 * `closeAuctionById` is auctionService.get — calling it runs the same
 * scheduled->open->closed lazy-advance logic the HTTP GET path already
 * uses, so there is exactly one code path that decides a winner and creates
 * the Order, whether triggered by a page visit or by this job firing.
 */
function startWorker(closeAuctionById) {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      await closeAuctionById(job.data.auctionId);
    },
    { connection },
  );
}

module.exports = { scheduleClose, cancelClose, startWorker };
