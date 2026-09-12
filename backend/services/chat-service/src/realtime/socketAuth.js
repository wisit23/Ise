const { verifyAccessToken } = require("@reloop/shared");

/**
 * Socket.IO connection middleware (`io.use(...)`). This is the ONLY place
 * that authenticates a WebSocket connection — the gateway's `ws: true`
 * proxy forwards the upgrade request straight through without running its
 * normal Bearer-token auth middleware (see architecture.md's note on this,
 * and plan.md's CHAT-006 Step 2). If this rejected nothing, every socket
 * event handler downstream would be trusting an unauthenticated caller.
 */
function verifySocketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));

  try {
    const payload = verifyAccessToken(token);
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;
    next();
  } catch {
    // Covers both a malformed/tampered token and a genuinely expired one —
    // jwt.verify() throws for both, and a socket connection has no
    // meaningful use for telling those apart (there's no refresh flow over
    // a socket; the client just reconnects with a fresh access token the
    // same way apiFetch's REST 401 handling already does).
    next(new Error("Unauthorized"));
  }
}

module.exports = { verifySocketAuth };
