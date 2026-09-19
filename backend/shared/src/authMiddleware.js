const { verifyAccessToken } = require("./jwt");
const {
  validateRemoteSession,
  sessionUnavailable,
} = require("./sessionValidation");

/**
 * Verifies the Bearer JWT and attaches trusted user context to the request.
 * Used by services that receive requests directly from the gateway
 * (gateway already validates, but services re-validate defensively).
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    // Auth installs its local database validator. Other apps use the internal
    // Auth API, including requests arriving directly without the gateway.
    const validate =
      req.app?.locals?.validateAccessSession || validateRemoteSession;
    await validate(payload, token);
  } catch (error) {
    const err = ["SESSION_REVOKED", "ACCOUNT_SUSPENDED"].includes(error.code)
      ? error
      : sessionUnavailable();
    return res.status(err.status).json({ error: err.message, code: err.code });
  }

  req.userId = payload.sub;
  req.userRole = payload.role;
  req.userRoles = payload.roles || (payload.role ? [payload.role] : []);
  req.permissions = payload.permissions || [];
  req.kycVerified = Boolean(payload.kycVerified);
  req.userDisplayName = payload.displayName || null;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

/** Server-side permission gate — Frontend hiding a menu is never authorization. */
function requirePermission(permission) {
  return (req, res, next) => {
    if (req.permissions?.includes(permission)) return next();
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Forbidden",
        requestId: req.id,
      },
    });
  };
}

/** Trusts x-user-* headers set by the gateway after it verified the JWT. */
function fromGatewayHeaders(req, res, next) {
  req.userId = req.headers["x-user-id"] || null;
  req.userRole = req.headers["x-user-role"] || null;
  req.userRoles = req.headers["x-user-roles"]
    ? req.headers["x-user-roles"].split(",")
    : req.userRole
      ? [req.userRole]
      : [];
  req.permissions = req.headers["x-user-permissions"]
    ? req.headers["x-user-permissions"].split(",")
    : [];
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
  requirePermission,
  fromGatewayHeaders,
  requireInternalToken,
};
