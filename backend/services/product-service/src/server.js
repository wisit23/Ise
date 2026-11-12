require("dotenv").config();
const {
  requireEnv,
  createServiceRuntime,
  startBackgroundWorkers,
} = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const auctionService = require("./features/auctions/auctionService");
const auctionCloseQueue = require("./jobs/auctionCloseQueue");
const {
  startReservationExpiryWorker,
} = require("./features/reservations/reservationService");
const campaignService = require("./features/campaigns/campaignService");

const prisma = require("./models/prismaClient");
const auctionRealtime = require("./features/auctions/auctionRealtime");
const Redis = require("ioredis");
const publisher = new Redis(process.env.REDIS_URL || "redis://redis:6379");
const subscriber = publisher.duplicate();
let relayReady = false;
for (const client of [publisher, subscriber])
  client.on("error", (error) =>
    console.warn("[auction-realtime]", error.message),
  );
const runtime = createServiceRuntime({
  app,
  service: "product-service",
  checks: [
    () => prisma.$queryRaw`SELECT 1`,
    async () => {
      if (!relayReady) throw new Error("relay starting");
      await Promise.all([publisher.ping(), subscriber.ping()]);
    },
  ],
});
runtime.addResource(() => prisma.$disconnect());
runtime.installSignals();
runtime.addDrain(() => auctionRealtime.closeSubscribers());
runtime.addResource(async () => {
  await Promise.all([publisher.quit(), subscriber.quit()]);
});
const relayStarting = auctionRealtime
  .startRelay({ publisher, subscriber })
  .then(() => {
    relayReady = true;
  })
  .catch((error) =>
    console.error("[auction-realtime] start failed:", error.message),
  );
runtime.addWorker(() => relayStarting);

const PORT = process.env.PRODUCT_PORT || 3002;
runtime.server.listen(PORT, () =>
  console.log(`[product-service] listening on ${PORT}`),
);

startBackgroundWorkers(() => {
  // Opens and closes auctions at their scheduled boundaries without page visits.
  const auctionWorker = auctionCloseQueue.startWorker(auctionService.get);
  runtime.addWorker(() => auctionCloseQueue.stopWorker(auctionWorker));
  const restoring = auctionService
    .restoreScheduledJobs()
    .catch((err) =>
      console.error(
        "[product-service] could not restore auction boundary jobs:",
        err.message,
      ),
    );

  runtime.addWorker(() => restoring);

  // Releases cart reservations whose 10-minute hold has expired.
  runtime.addWorker(startReservationExpiryWorker().stop);

  // Automatically transitions published campaigns whose endsAt has passed to "ended".
  runtime.addWorker(campaignService.startCampaignExpiryWorker().stop);
});
runtime.addResource(() => auctionCloseQueue.closeQueue());
