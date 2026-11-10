require("dotenv").config();
const { requireEnv, createServiceRuntime } = require("@reloop/shared");

requireEnv(["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]);

const app = require("./app");

const prisma = require("./models/prismaClient");
const runtime = createServiceRuntime({
  app,
  service: "auth-service",
  checks: [() => prisma.$queryRaw`SELECT 1`],
});
runtime.addResource(() => prisma.$disconnect());
runtime.installSignals();

const PORT = process.env.AUTH_PORT || 3001;
runtime.server.listen(PORT, () =>
  console.log(`[auth-service] listening on ${PORT}`),
);

// Daily job: marks verified sellers whose ID card has passed its expiry date
// as EXPIRED so they must re-submit KYC before listing again.
runtime.addWorker(require("./jobs/kycExpiryJob").start().stop);

// Daily job: marks verified sellers with no listing activity for ≥365 days
// as INACTIVE_EXPIRED so they must re-submit KYC before listing again.
runtime.addWorker(require("./jobs/sellerInactivityJob").start().stop);

// Daily job: prunes emailed one-time tokens past their retention period.
runtime.addWorker(require("./jobs/oneTimeTokenCleanupJob").start().stop);

runtime.addResource(() =>
  require("./middleware/rateLimit").closeRateLimitClient(),
);
