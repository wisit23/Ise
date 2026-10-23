const subscribers = new Map();

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

module.exports = { subscribe, publish };
