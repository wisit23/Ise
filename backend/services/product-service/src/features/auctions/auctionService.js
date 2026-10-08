const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const auctionRepository = require("./auctionRepository");
const defaultPrisma = require("../../models/prismaClient");
const { recordMarketingAudit } = require("../audit/marketingAuditService");
const orderClient = require("./orderClient");
const auctionCloseQueue = require("../../jobs/auctionCloseQueue");

function runInTransaction(fn) {
  if (auctionRepository.transaction) {
    return auctionRepository.transaction(fn);
  }
  return defaultPrisma.$transaction(fn);
}

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

function getStatusThai(status) {
  const labels = {
    draft: "ฉบับร่าง",
    pending_approval: "รอการอนุมัติ",
    approved: "อนุมัติแล้ว",
    scheduled: "ตั้งเวลาแล้ว",
    open: "กำลังเปิดประมูล",
    closed: "ปิดการประมูลแล้ว",
    rejected: "ถูกปฏิเสธ",
    cancelled: "ยกเลิกแล้ว",
  };
  return labels[status] || status;
}

function formatThaiDateTime(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}

function assertTransition(auction, to) {
  if (!canTransition(auction.status, to)) {
    throw conflict(
      `ไม่สามารถเปลี่ยนสถานะรายการประมูลจาก "${getStatusThai(auction.status)}" เป็น "${getStatusThai(to)}" ได้ในขณะนี้`,
    );
  }
}

async function loadAuction(id) {
  const auction = await auctionRepository.findById(id);
  if (!auction) throw notFound("ไม่พบข้อมูลรายการประมูลที่ระบุ");
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

async function closeAuction(auction, now = new Date()) {
  const auctionId = typeof auction === "string" ? auction : auction?.id;
  // Re-fetch to avoid race conditions if already closed concurrently (e.g. BullMQ worker vs page read)
  const fresh = await auctionRepository.findById(auctionId);
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
  }

  return runInTransaction(async (tx) => {
    // Under transaction, check if already closed concurrently
    const current = await tx.auctionItem.findUnique({
      where: { id: auction.id },
      include: {
        product: { include: { photos: { orderBy: { position: "asc" } } } },
        round: true,
      },
    });
    if (!current || current.status === "closed") {
      return current || auction;
    }

    if (!winningBid) {
      // If no bids were placed, release product back to "available"
      await auctionRepository.setProductStatus(
        auction.productId,
        "available",
        tx,
      );
    }

    const updated = await auctionRepository.updateStatus(
      auction.id,
      {
        status: "closed",
        closedAt: now,
        winningBidId: winningBid ? winningBid.id : null,
        winningOrderId,
      },
      tx,
    );

    await recordMarketingAudit(
      {
        actorId: "SYSTEM",
        actorRole: "SYSTEM",
        action: "AUCTION_ITEM_CLOSE",
        entityType: "AUCTION_ITEM",
        entityId: auction.id,
        previousState: auction,
        newState: updated,
        idempotencyKey: `AUCTION_ITEM_CLOSE:${auction.id}`,
      },
      { tx },
    );

    return updated;
  });
}

/** Seller submits one of their own available products for auction. */
async function submit({ user, input = {} }) {
  if (!["SELLER", "ADMIN"].includes(user.role)) {
    throw forbidden(
      "เฉพาะบัญชีผู้ขายเท่านั้นที่สามารถส่งสินค้าเข้าร่วมประมูลได้",
    );
  }

  const productId = input.productId;
  if (!productId)
    throw badRequest("กรุณาระบุสินค้าที่ต้องการส่งเข้าร่วมประมูล");

  const startingPrice = Number(input.startingPrice);
  const bidIncrement = Number(input.bidIncrement);
  if (!Number.isInteger(startingPrice) || startingPrice <= 0) {
    throw badRequest("ราคาเริ่มต้นต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
  }
  if (!Number.isInteger(bidIncrement) || bidIncrement <= 0) {
    throw badRequest("ราคาเสนอเพิ่มขั้นต่ำต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
  }

  const product = await auctionRepository.findProductOwner(productId);
  if (!product) throw notFound("ไม่พบข้อมูลสินค้าที่ระบุ");
  if (product.sellerId !== user.id) {
    throw forbidden("คุณสามารถส่งได้เฉพาะสินค้าของตนเองเข้าร่วมประมูลเท่านั้น");
  }
  if (!["available", "auction"].includes(product.status)) {
    throw badRequest(
      "สินค้าต้องอยู่ในสถานะพร้อมขายจึงจะสามารถส่งเข้าร่วมประมูลได้",
    );
  }

  // Check if there is an active submission round
  const activeRound = await auctionRepository.findActiveSubmissionRound();
  if (!activeRound) {
    throw badRequest(
      "ขณะนี้ไม่มีรอบเปิดรับสินค้าเข้าประมูล หรือหมดเวลาเปิดรับสินค้าแล้ว กรุณารอรอบถัดไป",
    );
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

/** Marketing approves a pending auction. */
async function approve({ user, auctionId }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์อนุมัติรายการประมูล");
  }

  const auction = await loadAuction(auctionId);

  // If the auction already has scheduled dates (from round), transition directly to scheduled!
  if (auction.scheduledStartAt && auction.scheduledEndAt) {
    assertTransition(auction, "scheduled");
    const updated = await runInTransaction(async (tx) => {
      const res = await auctionRepository.updateStatus(
        auctionId,
        {
          status: "scheduled",
          approvedBy: user.id,
          approvedAt: new Date(),
        },
        tx,
      );
      await recordMarketingAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "AUCTION_ITEM_APPROVE",
          entityType: "AUCTION_ITEM",
          entityId: auctionId,
          previousState: auction,
          newState: res,
        },
        { tx },
      );
      return res;
    });
    await auctionCloseQueue.scheduleClose(auctionId, auction.scheduledEndAt);
    return updated;
  }

  assertTransition(auction, "approved");
  return runInTransaction(async (tx) => {
    const updated = await auctionRepository.updateStatus(
      auctionId,
      {
        status: "approved",
        approvedBy: user.id,
        approvedAt: new Date(),
      },
      tx,
    );
    await recordMarketingAudit(
      {
        actorId: user.id,
        actorRole: user.role,
        action: "AUCTION_ITEM_APPROVE",
        entityType: "AUCTION_ITEM",
        entityId: auctionId,
        previousState: auction,
        newState: updated,
      },
      { tx },
    );
    return updated;
  });
}

/** Marketing rejects a pending auction. */
async function reject({ user, auctionId }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์ปฏิเสธรายการประมูล");
  }

  const auction = await loadAuction(auctionId);
  assertTransition(auction, "rejected");

  return runInTransaction(async (tx) => {
    await auctionRepository.setProductStatus(
      auction.productId,
      "available",
      tx,
    );
    const updated = await auctionRepository.updateStatus(
      auctionId,
      { status: "rejected" },
      tx,
    );
    await recordMarketingAudit(
      {
        actorId: user.id,
        actorRole: user.role,
        action: "AUCTION_ITEM_REJECT",
        entityType: "AUCTION_ITEM",
        entityId: auctionId,
        previousState: auction,
        newState: updated,
      },
      { tx },
    );
    return updated;
  });
}

/**
 * Derives round phase using strict half-open time boundaries:
 * upcoming:   now < submissionStartsAt
 * submission: submissionStartsAt <= now && now < submissionEndsAt
 * waiting:    submissionEndsAt <= now && now < auctionStartsAt
 * auction:    auctionStartsAt <= now && now < auctionEndsAt
 * ended:      now >= auctionEndsAt
 */
function deriveRoundPhase(round, now = new Date()) {
  if (!round) return null;
  const subStart = new Date(round.submissionStartsAt);
  const subEnd = new Date(round.submissionEndsAt);
  const aucStart = new Date(round.auctionStartsAt);
  const aucEnd = new Date(round.auctionEndsAt);

  if (now < subStart) return "upcoming";
  if (subStart <= now && now < subEnd) return "submission";
  if (subEnd <= now && now < aucStart) return "waiting";
  if (aucStart <= now && now < aucEnd) return "auction";
  return "ended";
}

/** Create an auction round by Marketing with overlap protection under advisory lock. */
async function createRound({ user, input = {} }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์สร้างรอบการประมูล");
  }

  const {
    title,
    submissionStartsAt,
    submissionEndsAt,
    auctionStartsAt,
    auctionEndsAt,
  } = input;
  if (!title || typeof title !== "string" || !title.trim()) {
    throw badRequest("กรุณากรอกชื่อรอบการประมูลให้ครบถ้วน");
  }

  const subStart = new Date(submissionStartsAt);
  const subEnd = new Date(submissionEndsAt);
  const aucStart = new Date(auctionStartsAt);
  const aucEnd = new Date(auctionEndsAt);

  if (
    [subStart, subEnd, aucStart, aucEnd].some((d) => Number.isNaN(d.getTime()))
  ) {
    throw badRequest(
      "กรุณาระบุวันและเวลาเปิดรับสินค้าและวันเวลาประมูลให้ครบถ้วนและถูกต้อง",
    );
  }

  const isValidIntervalOrder =
    subStart < subEnd && subEnd <= aucStart && aucStart < aucEnd;

  if (!isValidIntervalOrder) {
    if (subEnd <= subStart) {
      throw badRequest(
        "เวลาปิดรับสินค้าต้องอยู่หลังเวลาเริ่มเปิดรับสินค้า กรุณาตรวจสอบช่วงเวลารับสินค้า",
      );
    }
    if (aucStart < subEnd) {
      throw badRequest(
        "เวลาเริ่มการประมูลต้องอยู่หลังหรือตรงกับเวลาปิดรับสินค้า กรุณาตรวจสอบลำดับเวลา",
      );
    }
    if (aucEnd <= aucStart) {
      throw badRequest(
        "เวลาสิ้นสุดการประมูลต้องอยู่หลังเวลาเริ่มการประมูล กรุณาตรวจสอบช่วงเวลาประมูล",
      );
    }
    throw badRequest(
      "ลำดับเวลาไม่ถูกต้อง: ช่วงเวลาเปิดรับสินค้าต้องมาก่อนช่วงเวลาเริ่มประมูลจริง กรุณาตรวจสอบวันและเวลาที่เลือก",
    );
  }

  return auctionRepository.withRoundLock(async (tx) => {
    const conflicting = await auctionRepository.findConflictingRound(
      { subStart, aucEnd },
      tx,
    );
    if (conflicting) {
      const conflictStart = formatThaiDateTime(conflicting.submissionStartsAt);
      const conflictEnd = formatThaiDateTime(conflicting.auctionEndsAt);
      throw conflict(
        `ไม่สามารถสร้างรอบประมูลได้ เนื่องจากช่วงเวลาที่เลือกทับกับรอบ '${conflicting.title}' ซึ่งจัดระหว่าง ${conflictStart} ถึง ${conflictEnd} กรุณาเลือกช่วงเวลาใหม่`,
      );
    }

    const round = await auctionRepository.createRound(
      {
        title: title.trim(),
        submissionStartsAt: subStart,
        submissionEndsAt: subEnd,
        auctionStartsAt: aucStart,
        auctionEndsAt: aucEnd,
      },
      tx,
    );

    await recordMarketingAudit(
      {
        actorId: user.id,
        actorRole: user.role,
        action: "AUCTION_ROUND_CREATE",
        entityType: "AUCTION_ROUND",
        entityId: round.id,
        previousState: null,
        newState: round,
      },
      { tx },
    );

    return round;
  });
}

/** Get the current auction round, derived phase, and its status. */
async function getCurrentRound(now = new Date()) {
  const round = await auctionRepository.findCurrentRound(now);
  if (!round) {
    return {
      round: null,
      phase: null,
      isSubmissionOpen: false,
      isAuctionActive: false,
    };
  }

  const phase = deriveRoundPhase(round, now);
  return {
    round,
    phase,
    isSubmissionOpen: phase === "submission",
    isAuctionActive: phase === "auction",
  };
}

/** List all auction rounds with derived phase for Marketing. */
async function listRounds({ user }) {
  if (user?.role !== "MARKETING") {
    throw forbidden(
      "เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์ดูรายการรอบการประมูลทั้งหมด",
    );
  }
  const rounds = await auctionRepository.listRounds();
  const now = new Date();
  return rounds.map((r) => ({
    ...r,
    phase: deriveRoundPhase(r, now),
  }));
}

/** Marketing sets the open/close window for an approved auction. */
async function schedule({ user, auctionId, startsAt, endsAt }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์ตั้งเวลาเปิดประมูล");
  }

  const auction = await loadAuction(auctionId);
  assertTransition(auction, "scheduled");

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw badRequest("กรุณาระบุวันและเวลาเปิดและปิดประมูลให้ครบถ้วนและถูกต้อง");
  }
  if (start <= new Date()) {
    throw badRequest(
      "เวลาเปิดประมูลต้องเป็นวันและเวลาในอนาคต กรุณาเลือกวันเวลาใหม่",
    );
  }
  if (end <= start) {
    throw badRequest(
      "เวลาปิดประมูลต้องอยู่หลังเวลาเปิดประมูล กรุณาตรวจสอบช่วงเวลาอีกครั้ง",
    );
  }

  const updated = await runInTransaction(async (tx) => {
    const res = await auctionRepository.updateStatus(
      auctionId,
      {
        status: "scheduled",
        scheduledStartAt: start,
        scheduledEndAt: end,
      },
      tx,
    );
    await recordMarketingAudit(
      {
        actorId: user.id,
        actorRole: user.role,
        action: "AUCTION_ITEM_SCHEDULE",
        entityType: "AUCTION_ITEM",
        entityId: auctionId,
        previousState: auction,
        newState: res,
      },
      { tx },
    );
    return res;
  });

  // Books the exact-time close job now, not lazily — see auctionCloseQueue.js.
  await auctionCloseQueue.scheduleClose(auctionId, end);

  return updated;
}

/** Marketing can cancel an auction any time before it opens. */
async function cancel({ user, auctionId }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์ยกเลิกการประมูล");
  }

  const auction = await loadAuction(auctionId);
  assertTransition(auction, "cancelled");

  const updated = await runInTransaction(async (tx) => {
    await auctionRepository.setProductStatus(
      auction.productId,
      "available",
      tx,
    );
    const res = await auctionRepository.updateStatus(
      auctionId,
      {
        status: "cancelled",
      },
      tx,
    );
    await recordMarketingAudit(
      {
        actorId: user.id,
        actorRole: user.role,
        action: "AUCTION_ITEM_CANCEL",
        entityType: "AUCTION_ITEM",
        entityId: auctionId,
        previousState: auction,
        newState: res,
      },
      { tx },
    );
    return res;
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

function validateIdempotentBid(existing, { auctionId, userId, bidAmount }) {
  if (
    existing.auctionId !== auctionId ||
    existing.bidderId !== userId ||
    existing.amount !== bidAmount
  ) {
    throw conflict(
      "คำขอนี้ถูกส่งซ้ำด้วยข้อมูลราคาที่ไม่ตรงกับครั้งก่อนหน้า กรุณารีเฟรชหน้าจอแล้วลองใหม่อีกครั้ง",
    );
  }
  return existing;
}

/**
 * Places a bid, holding a Postgres advisory lock on the auction for the
 * duration of the transaction so two simultaneous bids can never both read
 * the same "current highest" and both succeed — the second one always
 * re-validates against the first one's committed bid. This is what decides
 * ties: whichever bid the database commits first wins the amount.
 */
async function placeBid({ user, auctionId, amount, idempotencyKey }) {
  if (!idempotencyKey) {
    throw badRequest(
      "ข้อมูลคำขอไม่สมบูรณ์ (ขาดรหัสป้องกันการทำรายการซ้ำ) กรุณาลองใหม่อีกครั้ง",
    );
  }
  const bidAmount = Number(amount);
  if (!Number.isInteger(bidAmount) || bidAmount <= 0) {
    throw badRequest("จำนวนเงินเสนอราคาต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
  }

  return auctionRepository.withAuctionLock(auctionId, async (tx) => {
    const auction = await tx.auctionItem.findUnique({
      where: { id: auctionId },
    });
    if (!auction) throw notFound("ไม่พบข้อมูลรายการประมูลที่ระบุ");
    if (auction.sellerId === user.id) {
      throw forbidden("คุณไม่สามารถเสนอราคาประมูลสินค้าของตนเองได้");
    }

    const existing = await tx.bid.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return validateIdempotentBid(existing, {
        auctionId,
        userId: user.id,
        bidAmount,
      });
    }

    const now = new Date();
    if (auction.status === "scheduled" && auction.scheduledStartAt <= now) {
      await tx.auctionItem.update({
        where: { id: auctionId },
        data: { status: "open", openedAt: now },
      });
    } else if (auction.status !== "open") {
      throw conflict(
        `รายการประมูลนี้ยังไม่เปิดให้เสนอราคา (สถานะปัจจุบัน: ${getStatusThai(auction.status)})`,
      );
    }
    if (auction.scheduledEndAt && auction.scheduledEndAt <= now) {
      throw conflict("การประมูลนี้สิ้นสุดลงแล้ว ไม่สามารถเสนอราคาเพิ่มได้");
    }

    const current = await auctionRepository.highestBid(auctionId, tx);
    const minAmount = current
      ? current.amount + auction.bidIncrement
      : auction.startingPrice;
    if (bidAmount < minAmount) {
      throw badRequest(
        `ราคาเสนอประมูลต้องไม่ต่ำกว่า ${minAmount.toLocaleString("th-TH")} บาท`,
      );
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
        const raceExisting = await tx.bid.findUnique({
          where: { idempotencyKey },
        });
        if (raceExisting) {
          return validateIdempotentBid(raceExisting, {
            auctionId,
            userId: user.id,
            bidAmount,
          });
        }
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
  closeAuction,
  createRound,
  getCurrentRound,
  listRounds,
  deriveRoundPhase,
};
