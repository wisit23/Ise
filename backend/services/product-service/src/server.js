require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const {
  cleanupExpired,
} = require("./features/reservations/reservationService");

const PORT = process.env.PRODUCT_PORT || 3002;
app.listen(PORT, () => console.log(`[product-service] listening on ${PORT}`));

// Lazy expiry in reserve() guarantees correctness. This worker keeps stale
// rows tidy even when no new buyer touches the product after the deadline.
const cleanupTimer = setInterval(() => {
  cleanupExpired().catch((err) =>
    console.error("[product-service] reservation cleanup failed", err),
  );
}, 30_000);
cleanupTimer.unref();
