require("dotenv").config();
const { createProxyMiddleware } = require("http-proxy-middleware");
const { requireEnv } = require("@reloop/shared");

requireEnv(["JWT_ACCESS_SECRET"]);

const app = require("./app");

const PORT = process.env.GATEWAY_PORT || 8080;
const server = app.listen(PORT, () =>
  console.log(`[gateway] listening on ${PORT}`),
);

// Proxy WebSocket upgrade requests (chat) through the gateway.
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/api/chat")) {
    createProxyMiddleware({
      target: app.SERVICES.chat,
      changeOrigin: true,
      ws: true,
    }).upgrade(req, socket, head);
  }
});
