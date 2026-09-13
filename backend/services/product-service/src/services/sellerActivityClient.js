// Fire-and-forget HTTP client: tells auth-service that a seller just created
// or updated a listing, so auth-service can update lastActiveAt on the
// SellerProfile and prevent the daily inactivity job from flagging them.
//
// Failures are swallowed (logged only) so a transient auth-service hiccup
// cannot break product creation — the worst outcome is that one event is
// missed, which a later listing will correct.
const http = require("http");

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_INTERNAL_URL || "http://auth-service:3001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

function recordActivity(sellerId) {
  try {
    const path = `/internal/seller/${encodeURIComponent(sellerId)}/activity`;
    const url = new URL(path, AUTH_SERVICE_URL);

    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname,
      method: "POST",
      headers: {
        "x-internal-token": INTERNAL_TOKEN,
        "Content-Length": 0,
      },
    };

    const req = http.request(options, (res) => {
      // Drain the response so the socket is released.
      res.resume();
      if (res.statusCode !== 204) {
        console.warn(
          `[sellerActivityClient] unexpected status ${res.statusCode} for seller ${sellerId}`,
        );
      }
    });

    req.on("error", (err) => {
      console.warn(
        `[sellerActivityClient] failed to record activity for seller ${sellerId}:`,
        err.message,
      );
    });

    req.end();
  } catch (err) {
    console.warn(
      `[sellerActivityClient] unexpected error for seller ${sellerId}:`,
      err.message,
    );
  }
}

module.exports = { recordActivity };
