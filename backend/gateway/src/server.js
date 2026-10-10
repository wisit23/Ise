require("dotenv").config();
const net = require("net");
const { URL } = require("url");
const { requireEnv } = require("@reloop/shared");

requireEnv(["JWT_ACCESS_SECRET"]);

const app = require("./app");

const PORT = process.env.GATEWAY_PORT || 8080;
const server = app.listen(PORT, () =>
  console.log(`[gateway] listening on ${PORT}`),
);

// WebSocket upgrades (chat) are proxied with a hand-rolled raw TCP pipe, NOT
// http-proxy / http-proxy-middleware's `ws: true` helpers. Both were tried
// first and both reliably corrupted the response under concurrency: with
// two clients connecting within the same tick, chat-service's own Socket.IO
// server completed BOTH WebSocket handshakes successfully (confirmed via a
// server-side "connection established" log firing twice) — but both
// clients still observed the connection reset. That isolates the bug to
// the library's handling of the RESPONSE path back through the proxy under
// concurrent upgrades, not to anything in this codebase's own logic.
//
// A raw TCP pipe sidesteps that entire abstraction: open a fresh socket to
// chat-service per upgrade, replay the original request line/headers onto
// it, forward any already-buffered bytes (`head`), then pipe the two raw
// sockets together in both directions. Each upgrade gets its own
// independent TCP connection and its own independent pipe — there is no
// shared internal connection pool or agent state for concurrent upgrades to
// corrupt.
const CHAT_TARGET = new URL(app.SERVICES.chat);

server.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith("/api/chat")) return;

  const target = net.connect(
    Number(CHAT_TARGET.port) || 80,
    CHAT_TARGET.hostname,
    () => {
      const headerLines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        // changeOrigin equivalent — the Host header must name the target,
        // not the gateway itself; it's re-added explicitly below instead.
        if (req.rawHeaders[i].toLowerCase() === "host") continue;
        headerLines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      headerLines.push(`Host: ${CHAT_TARGET.host}`, "", "");
      target.write(headerLines.join("\r\n"));
      // Bytes engine.io/socket.io-client already sent past the headers
      // (rare for the initial upgrade, but part of the HTTP upgrade
      // contract) must be replayed onto the target connection too, or the
      // very start of the WebSocket frame stream would be silently dropped.
      if (head && head.length) target.write(head);
      target.pipe(socket);
      socket.pipe(target);
    },
  );

  // A broken pipe on either side must tear down the other side too — an
  // unhandled 'error' event on either raw socket would otherwise crash the
  // gateway process, and a half-closed pipe left open leaks a connection to
  // chat-service for the lifetime of the process.
  target.on("error", (err) => {
    console.error("[gateway] chat WebSocket proxy error:", err.message);
    socket.destroy();
  });
  socket.on("error", () => target.destroy());
});
