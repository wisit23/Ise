let serverAnchor = null;
let monotonicAnchor = 0;

export function syncServerClock(timestamp) {
  if (!timestamp) return;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return;
  serverAnchor = parsed;
  monotonicAnchor = performance.now();
}

export function serverNow() {
  // Keep counting even if the user changes the computer's clock.
  return serverAnchor === null
    ? Date.now()
    : serverAnchor + performance.now() - monotonicAnchor;
}
