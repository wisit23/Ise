require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const auctionService = require("./features/auctions/auctionService");
const auctionCloseQueue = require("./jobs/auctionCloseQueue");

const PORT = process.env.PRODUCT_PORT || 3002;
app.listen(PORT, () => console.log(`[product-service] listening on ${PORT}`));

// Closes auctions at their exact scheduledEndAt without needing anyone to
// visit the page — see jobs/auctionCloseQueue.js.
auctionCloseQueue.startWorker(auctionService.get);
