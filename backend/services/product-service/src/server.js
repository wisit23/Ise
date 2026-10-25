require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const auctionService = require("./features/auctions/auctionService");
const auctionCloseQueue = require("./jobs/auctionCloseQueue");
const {
  startReservationExpiryWorker,
} = require("./features/reservations/reservationService");
const campaignService = require("./features/campaigns/campaignService");

const PORT = process.env.PRODUCT_PORT || 3002;
app.listen(PORT, () => console.log(`[product-service] listening on ${PORT}`));

// Opens and closes auctions at their scheduled boundaries without page visits.
auctionCloseQueue.startWorker(auctionService.get);
auctionService.restoreScheduledJobs().catch((err) =>
  console.error("[product-service] could not restore auction boundary jobs:", err.message),
);

// Releases cart reservations whose 10-minute hold has expired.
startReservationExpiryWorker();

// Automatically transitions published campaigns whose endsAt has passed to "ended".
campaignService.startCampaignExpiryWorker();
