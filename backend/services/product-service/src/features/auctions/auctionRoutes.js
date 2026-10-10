const { Router } = require("express");
const { requireAuth, requireCustomerAccount } = require("@reloop/shared");
const auctionController = require("./auctionController");

const router = Router();

// Auction Rounds (Marketing owns creation, Public can view rounds and items)
router.get("/rounds/current", auctionController.getCurrentRound);
router.get("/rounds/browse", auctionController.browseRounds);
router.get("/rounds/:roundId/items", auctionController.getRoundItems);
router.get("/rounds/:roundId", auctionController.getRoundDetails);
router.get("/rounds", requireAuth, auctionController.listRounds);
router.post("/rounds", requireAuth, auctionController.createRound);
router.patch(
  "/rounds/:roundId/cancel",
  requireAuth,
  auctionController.cancelRound,
);

// Public browsing — gateway lets these through without a bearer token, same
// as the product feed.
router.get("/", auctionController.list);
router.get("/:id", auctionController.getOne);

// Seller submits their own product; role/ownership rules live in the service.
router.post("/", requireAuth, auctionController.submit);

// Admin approval gate — must pass before Marketing can schedule it.
router.patch("/:id/approve", requireAuth, auctionController.approve);
router.patch("/:id/reject", requireAuth, auctionController.reject);

// Marketing owns the schedule/cancel actions (MKT-005).
router.patch("/:id/schedule", requireAuth, auctionController.schedule);
router.patch("/:id/cancel", requireAuth, auctionController.cancel);

// Buyer bidding.
router.post(
  "/:id/bids",
  requireAuth,
  requireCustomerAccount,
  auctionController.bid,
);

module.exports = router;
