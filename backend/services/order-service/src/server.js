require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const checkoutSessionService = require("./features/checkoutSessions/checkoutSessionService");

const PORT = process.env.ORDER_PORT || 3003;
app.listen(PORT, () => console.log(`[order-service] listening on ${PORT}`));

// Releases products and cancels checkout sessions when the QR payment window
// expires, even if the buyer closes the browser.
checkoutSessionService.startExpiryWorker();
