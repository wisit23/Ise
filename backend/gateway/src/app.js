const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { verifyAccessToken } = require("@reloop/shared");

const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || "http://auth-service:3001",
  products: process.env.PRODUCT_SERVICE_URL || "http://product-service:3002",
  orders: process.env.ORDER_SERVICE_URL || "http://order-service:3003",
  chat: process.env.CHAT_SERVICE_URL || "http://chat-service:3004",
  reviews: process.env.REVIEW_SERVICE_URL || "http://review-service:3005",
};

// Routes that don't require a valid access token (register/login/refresh, public feed reads).
const PUBLIC_PATHS = [
  /^\/api\/auth\/(register|login|refresh)/,
  /^\/api\/auth\/users\/[^/]+\/public/,
  /^\/api\/products\/feed/,
  /^\/api\/products\/search/,
  /^\/api\/products\/by-seller\//,
  // Swipe feed ("ปัดดูสินค้า") must be watchable by guests too.
  /^\/api\/products\/videos\/feed/,
  // Auction listing/detail must be browsable by guests; submit/approve/
  // schedule/bid all live on longer paths and stay gated by
  // product-service's own requireAuth.
  /^\/api\/products\/auctions\/[^/]+$/,
  // Single-item browsing must stay open to guests; write/delete routes on the
  // same path are still gated by product-service's own requireAuth middleware.
  /^\/api\/products\/[^/]+$/,
  // Uploaded media must render for guests too; POST /uploads (creating new
  // files) is still gated by product-service's own requireAuth/requireRole.
  /^\/uploads\//,
  // A store page's rating must be visible to guests browsing without an account.
  /^\/api\/reviews\/by-seller\//,
];

function isPublic(path) {
  return PUBLIC_PATHS.some((re) => re.test(path));
}

const app = express();
app.use(cors());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "gateway" }),
);

app.use((req, res, next) => {
  if (isPublic(req.path)) return next();

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const payload = verifyAccessToken(token);
    req.headers["x-user-id"] = payload.sub;
    req.headers["x-user-role"] = payload.role;
    // Multi-role/permission claims (ADM-001) — fromGatewayHeaders reads these,
    // so the gateway has to forward them or every permission check downstream
    // would silently see an empty set. Both are ASCII-only by construction
    // (role codes and permission slugs), so no encoding is needed here.
    req.headers["x-user-roles"] = (payload.roles || []).join(",");
    req.headers["x-user-permissions"] = (payload.permissions || []).join(",");
    // HTTP header values are Latin-1 only; displayName can be Thai (or any
    // non-ASCII) text, which throws ERR_INVALID_CHAR in http-proxy if set
    // raw. Encode here, decode in authMiddleware's fromGatewayHeaders.
    req.headers["x-user-display-name"] = encodeURIComponent(
      payload.displayName || "",
    );
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

app.use(
  "/api/auth",
  createProxyMiddleware({ target: SERVICES.auth, changeOrigin: true }),
);
app.use(
  "/api/products",
  createProxyMiddleware({ target: SERVICES.products, changeOrigin: true }),
);
app.use(
  "/uploads",
  createProxyMiddleware({
    target: SERVICES.products,
    changeOrigin: true,
    // Unlike /api/products (whose stripped path deliberately matches
    // product-service's routes mounted at "/"), product-service mounts
    // static file serving and the upload endpoint AT "/uploads" specifically
    // so they don't collide with "GET /:id" / "POST /" in productRoutes.
    // Express strips the "/uploads" mount prefix before this middleware
    // runs, so it has to be added back here.
    pathRewrite: (path) => `/uploads${path}`,
  }),
);
app.use(
  "/api/orders",
  createProxyMiddleware({ target: SERVICES.orders, changeOrigin: true }),
);
app.use(
  "/api/chat",
  createProxyMiddleware({
    target: SERVICES.chat,
    changeOrigin: true,
    ws: true,
  }),
);
app.use(
  "/api/reviews",
  createProxyMiddleware({ target: SERVICES.reviews, changeOrigin: true }),
);

module.exports = app;
module.exports.SERVICES = SERVICES;
