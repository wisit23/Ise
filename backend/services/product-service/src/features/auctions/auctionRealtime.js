const { randomUUID } = require("node:crypto");
const subscribers = new Map();
const origin = randomUUID();
const CHANNEL = "reloop:auction-updates";
let relay;

async function startRelay({ publisher, subscriber }) {
  const receive = (channel, raw) => {
    if (channel !== CHANNEL) return;
    try {
      const event = JSON.parse(raw);
      if (
        event.origin !== origin &&
        typeof event.auctionId === "string" &&
        typeof event.type === "string"
      ) {
        publishLocal(event.auctionId, event.type);
      }
    } catch {
      /* Ignore malformed pub/sub messages, never persist them. */
    }
  };
  subscriber.on("message", receive);
  await subscriber.subscribe(CHANNEL);
  relay = publisher;
  return async () => {
    relay = null;
    subscriber.off("message", receive);
    await Promise.all([publisher.quit(), subscriber.quit()]);
  };
}

function closeSubscribers() {
  for (const listeners of subscribers.values()) {
    for (const res of listeners) res.end();
  }
  subscribers.clear();
}

function subscribe(auctionId, req, res) {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const listeners = subscribers.get(auctionId) || new Set();
  listeners.add(res);
  subscribers.set(auctionId, listeners);
  res.write(`event: ready\ndata: ${JSON.stringify({ auctionId })}\n\n`);

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
  heartbeat.unref?.();

  const cleanup = () => {
    clearInterval(heartbeat);
    listeners.delete(res);
    if (listeners.size === 0) subscribers.delete(auctionId);
  };
  const closeEmitter = typeof res.on === "function" ? res : req;
  closeEmitter.on("close", cleanup);
  return cleanup;
}

function publish(auctionId, type = "auction.updated") {
  const delivered = publishLocal(auctionId, type);
  if (relay)
    relay
      .publish(CHANNEL, JSON.stringify({ origin, auctionId, type }))
      .catch((error) =>
        console.error("[auction-realtime] relay failed:", error.message),
      );
  return delivered;
}

function publishLocal(auctionId, type) {
  const listeners = subscribers.get(auctionId);
  if (!listeners?.size) return 0;
  const payload = `event: auction-update\ndata: ${JSON.stringify({ auctionId, type })}\n\n`;
  let delivered = 0;
  for (const res of [...listeners]) {
    try {
      res.write(payload);
      delivered++;
    } catch {
      listeners.delete(res);
    }
  }
  if (listeners.size === 0) subscribers.delete(auctionId);
  return delivered;
}

module.exports = { subscribe, publish, startRelay, closeSubscribers };
