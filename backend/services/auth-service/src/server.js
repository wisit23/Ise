require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]);

const app = require("./app");

const PORT = process.env.AUTH_PORT || 3001;
app.listen(PORT, () => console.log(`[auth-service] listening on ${PORT}`));

// Daily job: marks verified sellers whose ID card has passed its expiry date
// as EXPIRED so they must re-submit KYC before listing again.
require("./jobs/kycExpiryJob").start();

// Daily job: marks verified sellers with no listing activity for ≥365 days
// as INACTIVE_EXPIRED so they must re-submit KYC before listing again.
require("./jobs/sellerInactivityJob").start();
