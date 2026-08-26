const { verifyAccessToken } = require("./jwt");

/**
 * Verifies the Bearer JWT and attaches trusted user context to the request.
 * Used by services that receive requests directly from the gateway
 * (gateway already validates, but services re-validate defensively).
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userRole = payload.role;
    req.userDisplayName = payload.displayName || null;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

/** Trusts x-user-id / x-user-role headers set by the gateway after it verified the JWT. */
function fromGatewayHeaders(req, res, next) {
  req.userId = req.headers["x-user-id"] || null;
  req.userRole = req.headers["x-user-role"] || null;
  // Gateway URL-encodes this header (raw HTTP headers are Latin-1 only, and
  // display names can contain non-ASCII text) — decode it back here.
  const rawDisplayName = req.headers["x-user-display-name"];
  req.userDisplayName = rawDisplayName
    ? decodeURIComponent(rawDisplayName)
    : null;
  next();
}

/** Guards internal service-to-service endpoints (e.g. product lock/unlock/sold). */
function requireInternalToken(req, res, next) {
  const token = req.headers["x-internal-token"];
  const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expectedToken || !token || token !== expectedToken) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

module.exports = {
  requireAuth,
  requireRole,
  fromGatewayHeaders,
  requireInternalToken,
};
