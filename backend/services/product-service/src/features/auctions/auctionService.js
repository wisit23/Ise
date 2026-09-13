const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const auctionRepository = require("./auctionRepository");
const orderClient = require("./orderClient");
const auctionCloseQueue = require("../../jobs/auctionCloseQueue");

// UR-10/UR-11 (MKT-005) lifecycle. Seller submits -> Admin approves/rejects ->
// Marketing schedules the open/close window -> system opens/closes it ->
// winner gets an Order. Closing happens two ways: a BullMQ job fires exactly
// at scheduledEndAt (see jobs/auctionCloseQueue.js) so nobody has to visit
// the page, and maybeAdvance below still lazily closes on read/write as a
// fallback if the job was ever missed (e.g. Redis was down).
const TRANSITIONS = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "scheduled"],
  approved: ["scheduled", "cancelled"],
  scheduled: ["open", "cancelled"],
  open: ["closed"],
  closed: [],
  rejected: [],
  cancelled: [],
};

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}

function assertTransition(auction, to) {
  if (!canTransition(auction.status, to)) {
    throw conflict(`cannot move auction from ${auction.status} to ${to}`);
  }
}

async function loadAuction(id) {
  const auction = await auctionRepository.findById(id);
  if (!auction) throw notFound("auction not found");
  return auction;
}

/**
 * Lazily flips scheduled -> open and open -> closed based on wall-clock time
 * against the Marketing-set schedule. Called on every read/write so an
 * auction never gets "stuck" waiting on a cron job that doesn't exist yet
 * (no BullMQ scheduler is wired up for this feature).
 */
async function maybeAdvance(auction, now = new Date()) {
  if (auction.status === "scheduled" && auction.scheduledStartAt <= now) {
    auction = await auctionRepository.updateStatus(auction.id, {
      status: "open",
      openedAt: now,
    });
  }
  if (auction.status === "open" && auction.scheduledEndAt <= now) {
    auction = await closeAuction(auction, now);
  }
  return auction;
}

async function closeAuction(auction, now) {
  // Re-fetch to avoid race conditions if already closed concurrently (e.g. BullMQ worker vs page read)
  const fresh = await auctionRepository.findById(auction.id);
  if (!fresh || fresh.status === "closed") {
    return fresh || auction;
  }
  auction = fresh;

  const winningBid = await auctionRepository.highestBid(auction.id);

  let winningOrderId = null;
  if (winningBid) {
    const order = await orderClient.createOrderFromAuction({
      auctionId: auction.id,
      productId: auction.productId,
      productTitle: auction.product.title,
      sellerId: auction.sellerId,
      buyerId: winningBid.bidderId,
      price: winningBid.amount,
    });
    winningOrderId = order.id;
  } else {
    // If no bids were placed, release product back to "available"
    await auctionRepository.setProductStatus(auction.productId, "available");
  }

  return auctionRepository.updateStatus(auction.id, {
    status: "closed",
    closedAt: now,
    winningBidId: winningBid ? winningBid.id : null,
    winningOrderId,
  });
}

/** Seller submits one of their own available products for auction. */
async function submit({ user, input = {} }) {
  if (!["SELLER", "ADMIN"].includes(user.role)) {
    throw forbidden("only seller accounts can submit an auction");
  }

  const productId = input.productId;
  if (!productId) throw badRequest("productId is required");

  const startingPrice = Number(input.startingPrice);
  const bidIncrement = Number(input.bidIncrement);
  if (!Number.isInteger(startingPrice) || startingPrice <= 0) {
    throw badRequest("startingPrice must be a positive whole number");
  }
  if (!Number.isInteger(bidIncrement) || bidIncrement <= 0) {
    throw badRequest("bidIncrement must be a positive whole number");
  }

  const product = await auctionRepository.findProductOwner(productId);
  if (!product) throw notFound("product not found");
  if (product.sellerId !== user.id) {
    throw forbidden("you can only auction your own products");
  }
  if (!["available", "auction"].includes(product.status)) {
    throw badRequest("product must be available to enter an auction");
  }

  // Check if there is an active submission round
  const activeRound = await auctionRepository.findActiveSubmissionRound();
  if (!activeRound) {
    throw badRequest("ขณะนี้ไม่มีรอบเปิดรับสินค้าเข้าประมูล หรือหมดเวลาเปิดรับแล้ว");
  }

  if (product.status !== "auction") {
    await auctionRepository.setProductStatus(productId, "auction");
  }

  return auctionRepository.create({
    productId,
    sellerId: user.id,
    startingPrice,
    bidIncrement,
    status: "pending_approval",
    roundId: activeRound.id,
    scheduledStartAt: activeRound.auctionStartsAt,
    scheduledEndAt: activeRound.auctionEndsAt,
  });
}

/** Marketing or Admin approves a pending auction. */
async function approve({ user, auctionId }) {
  if (!["MARKETING", "ADMIN"].includes(user.role)) {
    throw forbidden("only Marketing or Admin can approve auctions");
  }

  const auction = await loadAuction(auctionId);

  // If the auction already has scheduled dates (from round), transition directly to scheduled!
  if (auction.scheduledStartAt && auction.scheduledEndAt) {
    assertTransition(auction, "scheduled");
    const updated = await auctionRepository.updateStatus(auctionId, {
      status: "scheduled",
      approvedBy: user.id,
      approvedAt: new Date(),
    });
    await auctionCloseQueue.scheduleClose(auctionId, auction.scheduledEndAt);
    return updated;
  }

  assertTransition(auction, "approved");
  return auctionRepository.updateStatus(auctionId, {
    status: "approved",
    approvedBy: user.id,
    approvedAt: new Date(),
  });
}

/** Marketing or Admin rejects a pending auction. */
async function reject({ user, auctionId }) {
  if (!["MARKETING", "ADMIN"].includes(user.role)) {
    throw forbidden("only Marketing or Admin can reject auctions");
  }

  const auction = await loadAuction(auctionId);
  assertTransition(auction, "rejected");

  await auctionRepository.setProductStatus(auction.productId, "available");

  return auctionRepository.updateStatus(auctionId, { status: "rejected" });
}

/** Create an auction round by Marketing/Admin. */
async function createRound({ user, input = {} }) {
  if (!["MARKETING", "ADMIN"].includes(user?.role)) {
    throw forbidden("only Marketing or Admin can create auction rounds");
  }

  const { title, submissionStartsAt, submissionEndsAt, auctionStartsAt, auctionEndsAt } = input;
  if (!title || typeof title !== "string" || !title.trim()) {
    throw badRequest("title is required");
  }

  const subStart = new Date(submissionStartsAt);
  const subEnd = new Date(submissionEndsAt);
  const aucStart = new Date(auctionStartsAt);
  const aucEnd = new Date(auctionEndsAt);

  if ([subStart, subEnd, aucStart, aucEnd].some((d) => Number.isNaN(d.getTime()))) {
    throw badRequest("all dates (submissionStartsAt, submissionEndsAt, auctionStartsAt, auctionEndsAt) must be valid dates");
  }

  if (subEnd <= subStart) {
    throw badRequest("submissionEndsAt must be after submissionStartsAt");
  }

  if (aucStart < subEnd) {
    throw badRequest("auctionStartsAt must be after or equal to submissionEndsAt");
  }

  if (aucEnd <= aucStart) {
    throw badRequest("auctionEndsAt must be after auctionStartsAt");
  }

  return auctionRepository.createRound({
    title: title.trim(),
    submissionStartsAt: subStart,
    submissionEndsAt: subEnd,
    auctionStartsAt: aucStart,
    auctionEndsAt: aucEnd,
  });
}

/** Get the current auction round and its status. */
async function getCurrentRound(now = new Date()) {
  const round = await auctionRepository.findCurrentRound();
  if (!round) {
    return {
      round: null,
      isSubmissionOpen: false,
      isAuctionActive: false,
    };
  }

  const isSubmissionOpen =
    now >= new Date(round.submissionStartsAt) &&
    now <= new Date(round.submissionEndsAt);

  const isAuctionActive =
    now >= new Date(round.auctionStartsAt) &&
    now <= new Date(round.auctionEndsAt);

  return {
    round,
    isSubmissionOpen,
    isAuctionActive,
  };
}

/** List all auction rounds for Marketing/Admin. */
async function listRounds({ user }) {
  if (!["MARKETING", "ADMIN"].includes(user?.role)) {
    throw forbidden("only Marketing or Admin can list all auction rounds");
  }
  return auctionRepository.listRounds();
}

/** Marketing sets the open/close window for an approved auction. */
async function schedule({ user, auctionId, startsAt, endsAt }) {
  if (!["MARKETING", "ADMIN"].includes(user.role)) {
    throw forbidden("only Marketing can schedule auctions");
  }

  const auction = await loadAuction(auctionId);
  assertTransition(auction, "scheduled");

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw badRequest("startsAt/endsAt must be valid dates");
  }
  if (start <= new Date()) throw badRequest("startsAt must be in the future");
  if (end <= start) throw badRequest("endsAt must be after startsAt");

  const updated = await auctionRepository.updateStatus(auctionId, {
    status: "scheduled",
    scheduledStartAt: start,
    scheduledEndAt: end,
  });

  // Books the exact-time close job now, not lazily — see auctionCloseQueue.js.
  await auctionCloseQueue.scheduleClose(auctionId, end);

  return updated;
}

/** Marketing/Admin can cancel an auction any time before it opens. */
async function cancel({ user, auctionId }) {
  if (!["MARKETING", "ADMIN"].includes(user.role)) {
    throw forbidden("only Marketing can cancel auctions");
  }

  const auction = await loadAuction(auctionId);
  assertTransition(auction, "cancelled");

  await auctionRepository.setProductStatus(auction.productId, "available");

  const updated = await auctionRepository.updateStatus(auctionId, {
    status: "cancelled",
  });
  await auctionCloseQueue.cancelClose(auctionId);
  return updated;
}

async function get(auctionId) {
  const auction = await loadAuction(auctionId);
  return maybeAdvance(auction);
}

async function list({ status, skip, take, roundId }) {
  return auctionRepository.list({ status, skip, take, roundId });
}

/**
 * Places a bid, holding a Postgres advisory lock on the auction for the
 * duration of the transaction so two simultaneous bids can never both read
 * the same "current highest" and both succeed — the second one always
 * re-validates against the first one's committed bid. This is what decides
 * ties: whichever bid the database commits first wins the amount.
 */
async function placeBid({ user, auctionId, amount, idempotencyKey }) {
  if (!idempotencyKey) throw badRequest("idempotencyKey is required");
  const bidAmount = Number(amount);
  if (!Number.isInteger(bidAmount) || bidAmount <= 0) {
    throw badRequest("amount must be a positive whole number");
  }

  return auctionRepository.withAuctionLock(auctionId, async (tx) => {
    const auction = await tx.auctionItem.findUnique({
      where: { id: auctionId },
    });
    if (!auction) throw notFound("auction not found");
    if (auction.sellerId === user.id) {
      throw forbidden("you cannot bid on your own auction");
    }

    const now = new Date();
    if (auction.status === "scheduled" && auction.scheduledStartAt <= now) {
      await tx.auctionItem.update({
        where: { id: auctionId },
        data: { status: "open", openedAt: now },
      });
    } else if (auction.status !== "open") {
      throw conflict(`auction is ${auction.status}, not open for bidding`);
    }
    if (auction.scheduledEndAt && auction.scheduledEndAt <= now) {
      throw conflict("auction has already ended");
    }

    const current = await auctionRepository.highestBid(auctionId, tx);
    const minAmount = current
      ? current.amount + auction.bidIncrement
      : auction.startingPrice;
    if (bidAmount < minAmount) {
      throw badRequest(`bid must be at least ${minAmount}`);
    }

    let createdBid;
    try {
      createdBid = await auctionRepository.createBid(
        { auctionId, bidderId: user.id, amount: bidAmount, idempotencyKey },
        tx,
      );
    } catch (err) {
      // A retried request with the same idempotencyKey must return the
      // original bid, not a duplicate or a confusing 500.
      if (err.code === "P2002") {
        return tx.bid.findUnique({ where: { idempotencyKey } });
      }
      throw err;
    }

    // Anti-sniping soft close: If a new bid is placed within 5 minutes of scheduledEndAt, extend by 5 minutes.
    const EXTENSION_WINDOW_MS = 5 * 60 * 1000;
    const EXTENSION_TIME_MS = 5 * 60 * 1000;

    if (auction.scheduledEndAt) {
      const remainingMs = auction.scheduledEndAt.getTime() - now.getTime();
      if (remainingMs > 0 && remainingMs <= EXTENSION_WINDOW_MS) {
        const newScheduledEndAt = new Date(
          auction.scheduledEndAt.getTime() + EXTENSION_TIME_MS,
        );
        await tx.auctionItem.update({
          where: { id: auctionId },
          data: { scheduledEndAt: newScheduledEndAt },
        });
        await auctionCloseQueue.scheduleClose(auctionId, newScheduledEndAt);
      }
    }

    return createdBid;
  });
}

module.exports = {
  canTransition,
  submit,
  approve,
  reject,
  schedule,
  cancel,
  get,
  list,
  placeBid,
  maybeAdvance,
  createRound,
  getCurrentRound,
  listRounds,
};
