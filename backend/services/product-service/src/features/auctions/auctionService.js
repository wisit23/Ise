const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const auctionRepository = require("./auctionRepository");
const defaultPrisma = require("../../models/prismaClient");
const { recordMarketingAudit } = require("../audit/marketingAuditService");
const orderClient = require("./orderClient");
const auctionCloseQueue = require("../../jobs/auctionCloseQueue");
const chatClient = require("./chatClient");
const MAX_CANCELLATION_REASON_LENGTH = 500;

const {
  requireSellerRole,
  requireVerifiedSeller,
  validateCreateRequest,
  requireValidMediaCount,
  requireKnownCondition,
} = require("../../services/productValidation");
const productModel = require("../../models/productModel");
const { buildCreateProductData } = require("../../controllers/productPayload");
const sellerActivityClient = require("../../services/sellerActivityClient");

function isCategoryAllowedInRound(round, category) {
  if (!round) return false;
  const cats = round.categories;
  if (!Array.isArray(cats) || cats.length === 0) {
    return true;
  }
  return cats.includes(category);
}

function runInTransaction(fn) {
  if (auctionRepository.transaction) {
    return auctionRepository.transaction(fn);
  }
  return defaultPrisma.$transaction(fn);
}

function runWithAuctionLock(auctionId, fn) {
  if (auctionRepository.withAuctionLock) {
    return auctionRepository.withAuctionLock(auctionId, fn);
  }
  return runInTransaction(fn);
}

function runWithProductLock(productId, fn) {
  if (auctionRepository.withProductLock) {
    return auctionRepository.withProductLock(productId, fn);
  }
  return runInTransaction(fn);
}

function runWithRoundMutationLock(roundId, fn, options = {}) {
  if (auctionRepository.withRoundMutationLock) {
    return auctionRepository.withRoundMutationLock(roundId, fn, options);
  }
  if (options?.productId) {
    return runWithProductLock(options.productId, fn);
  }
  return runInTransaction(fn);
}

async function readLiveRoundInTx(roundId, tx) {
  if (
    typeof tx?.$executeRaw !== "function" &&
    typeof tx?.auctionRound?.findUnique === "function"
  ) {
    return tx.auctionRound.findUnique({ where: { id: roundId } });
  }
  return auctionRepository.findRoundForSubmission(roundId, tx);
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
  open: ["closed", "cancelled"],
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

  return runWithAuctionLock(auctionId, async (tx) => {
    let current = null;
    if (
      typeof tx?.$executeRaw === "function" &&
      typeof tx?.auctionItem?.findUnique === "function"
    ) {
      current = await tx.auctionItem.findUnique({
        where: { id: auctionId },
        include: {
          product: { include: { photos: { orderBy: { position: "asc" } } } },
          round: true,
        },
      });
    } else {
      current = await auctionRepository.findById(auctionId, tx);
    }

    if (
      !current ||
      current.status === "closed" ||
      current.status === "cancelled" ||
      current.round?.cancelledAt
    ) {
      return current || auction;
    }

    const winningBid = await auctionRepository.highestBid(current.id, tx);

    let winningOrderId = null;
    if (winningBid) {
      const order = await orderClient.createOrderFromAuction({
        auctionId: current.id,
        productId: current.productId,
        productTitle: current.product?.title,
        sellerId: current.sellerId,
        buyerId: winningBid.bidderId,
        price: winningBid.amount,
      });
      winningOrderId = order.id;
    } else {
      // If no bids were placed, release product back to "auction_action_required" (never auto-revert to "available")
      await auctionRepository.setProductStatus(
        current.productId,
        "auction_action_required",
        tx,
      );
    }

    const updated = await auctionRepository.updateStatus(
      current.id,
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
        entityId: current.id,
        previousState: current,
        newState: updated,
        idempotencyKey: `AUCTION_ITEM_CLOSE:${current.id}`,
      },
      { tx },
    );

    return updated;
  });
}

/** Seller submits a new product or one of their own available products for auction. */
async function submit({ user, input = {} }) {
  requireSellerRole(user?.role);

  const roundId =
    input.roundId && typeof input.roundId === "string"
      ? input.roundId.trim()
      : "";
  if (!roundId) {
    throw badRequest("กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม");
  }

  const chosenRound = await auctionRepository.findRoundForSubmission(roundId);
  if (!chosenRound) {
    throw badRequest("ไม่พบรอบประมูลที่เลือก กรุณากลับไปเลือกรอบใหม่");
  }
  if (chosenRound.cancelledAt) {
    throw badRequest("รอบประมูลนี้ถูกยกเลิกแล้ว ไม่สามารถส่งสินค้าเข้าร่วมได้");
  }

  const now = new Date();
  if (now < new Date(chosenRound.submissionStartsAt)) {
    throw badRequest(
      "รอบประมูลนี้ยังไม่เปิดรับสินค้า กรุณาเลือกรอบที่กำลังเปิดรับ",
    );
  }
  if (now >= new Date(chosenRound.submissionEndsAt)) {
    throw badRequest("รอบประมูลนี้ปิดรับสินค้าแล้ว กรุณาเลือกรอบอื่น");
  }

  const startingPrice = Number(input.startingPrice);
  const bidIncrement = Number(input.bidIncrement);
  if (!Number.isInteger(startingPrice) || startingPrice <= 0) {
    throw badRequest("ราคาเริ่มต้นต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
  }
  if (!Number.isInteger(bidIncrement) || bidIncrement <= 0) {
    throw badRequest("ราคาเสนอเพิ่มขั้นต่ำต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
  }

  // Flow A: Existing product submission (Requirement 4 & Seller Recovery)
  // Acquires locks in fixed order: Round Lock -> Product Lock
  if (input.productId) {
    return runWithRoundMutationLock(
      chosenRound.id,
      async (tx) => {
        // Re-verify round state inside transaction after acquiring Round Lock
        const liveRound = await readLiveRoundInTx(chosenRound.id, tx);
        const txNow = new Date();
        if (!liveRound) {
          throw badRequest("ไม่พบรอบประมูลที่เลือก กรุณากลับไปเลือกรอบใหม่");
        }
        if (liveRound.cancelledAt) {
          throw badRequest(
            "รอบประมูลนี้ถูกยกเลิกแล้ว ไม่สามารถส่งสินค้าเข้าร่วมได้",
          );
        }
        if (txNow < new Date(liveRound.submissionStartsAt)) {
          throw badRequest(
            "รอบประมูลนี้ยังไม่เปิดรับสินค้า กรุณาเลือกรอบที่กำลังเปิดรับ",
          );
        }
        if (txNow >= new Date(liveRound.submissionEndsAt)) {
          throw badRequest("รอบประมูลนี้ปิดรับสินค้าแล้ว กรุณาเลือกรอบอื่น");
        }

        const product = await auctionRepository.findProductOwner(
          input.productId,
          tx,
        );
        if (!product) throw notFound("ไม่พบข้อมูลสินค้าที่ระบุ");
        if (product.sellerId !== user.id) {
          throw forbidden(
            "คุณสามารถส่งได้เฉพาะสินค้าของตนเองเข้าร่วมประมูลเท่านั้น",
          );
        }
        if (
          !["available", "auction", "auction_action_required"].includes(
            product.status,
          )
        ) {
          throw badRequest(
            "สินค้าต้องอยู่ในสถานะพร้อมขายหรือรอการดำเนินการจึงจะสามารถส่งเข้าร่วมประมูลได้",
          );
        }

        // Must check product.category from database against round's allowed categories
        // Ignore any category passed by client in input!
        if (
          !isCategoryAllowedInRound(chosenRound, product.category) ||
          !isCategoryAllowedInRound(liveRound, product.category)
        ) {
          throw badRequest(
            `รอบประมูลนี้ไม่เปิดรับสินค้าหมวดหมู่ ‘${product.category}’ กรุณาเลือกรอบอื่นหรือเปลี่ยนหมวดหมู่สินค้า`,
          );
        }

        const activeAuction =
          await auctionRepository.findActiveAuctionByProductId(product.id, tx);
        if (activeAuction) {
          throw conflict(
            "สินค้านี้กำลังอยู่ในรายการประมูลที่ยังดำเนินการอยู่ ไม่สามารถส่งซ้ำได้",
          );
        }

        if (product.status !== "auction") {
          await auctionRepository.setProductStatus(product.id, "auction", tx);
        }
        const auctionItem = await auctionRepository.create(
          {
            productId: product.id,
            sellerId: user.id,
            startingPrice,
            bidIncrement,
            status: "pending_approval",
            roundId: liveRound.id,
            scheduledStartAt: liveRound.auctionStartsAt,
            scheduledEndAt: liveRound.auctionEndsAt,
          },
          tx,
        );

        sellerActivityClient.recordActivity(user.id);

        return auctionItem;
      },
      { productId: input.productId },
    );
  }

  // Flow B: New product submission with atomic Product and AuctionItem creation (Requirements 2 & 3)
  requireVerifiedSeller(user?.role, user?.kycVerified, user?.kycStatus);

  const category =
    input.category && typeof input.category === "string"
      ? input.category.trim()
      : "";
  if (!category) {
    throw badRequest("กรุณาระบุหมวดหมู่สินค้า");
  }

  const knownCategory = await auctionRepository.findCategory(category);
  if (!knownCategory) {
    throw badRequest(`หมวดหมู่ "${category}" ไม่มีอยู่ในระบบ`);
  }

  if (!isCategoryAllowedInRound(chosenRound, category)) {
    throw badRequest(
      `รอบประมูลนี้ไม่เปิดรับสินค้าหมวดหมู่ ‘${category}’ กรุณาเลือกรอบอื่นหรือเปลี่ยนหมวดหมู่สินค้า`,
    );
  }

  // Validate product fields using existing rules
  validateCreateRequest({
    title: input.title,
    price: startingPrice,
    category,
  });
  requireValidMediaCount(input.media);
  await requireKnownCondition(input.condition);

  // Acquires Round Lock (same key as cancelRound) before checking round and creating Product/AuctionItem
  return runWithRoundMutationLock(chosenRound.id, async (tx) => {
    // Re-verify round state inside transaction after acquiring Round Lock
    const liveRound = await readLiveRoundInTx(chosenRound.id, tx);
    const txNow = new Date();
    if (!liveRound) {
      throw badRequest("ไม่พบรอบประมูลที่เลือก กรุณากลับไปเลือกรอบใหม่");
    }
    if (liveRound.cancelledAt) {
      throw badRequest(
        "รอบประมูลนี้ถูกยกเลิกแล้ว ไม่สามารถส่งสินค้าเข้าร่วมได้",
      );
    }
    if (txNow < new Date(liveRound.submissionStartsAt)) {
      throw badRequest(
        "รอบประมูลนี้ยังไม่เปิดรับสินค้า กรุณาเลือกรอบที่กำลังเปิดรับ",
      );
    }
    if (txNow >= new Date(liveRound.submissionEndsAt)) {
      throw badRequest("รอบประมูลนี้ปิดรับสินค้าแล้ว กรุณาเลือกรอบอื่น");
    }
    if (!isCategoryAllowedInRound(liveRound, category)) {
      throw badRequest(
        `รอบประมูลนี้ไม่เปิดรับสินค้าหมวดหมู่ ‘${category}’ กรุณาเลือกรอบอื่นหรือเปลี่ยนหมวดหมู่สินค้า`,
      );
    }

    const productData = buildCreateProductData(user.id, {
      ...input,
      category,
      price: startingPrice,
      status: "auction",
    });
    const product = await productModel.create(productData, tx);

    const auctionItem = await auctionRepository.create(
      {
        productId: product.id,
        sellerId: user.id,
        startingPrice,
        bidIncrement,
        status: "pending_approval",
        roundId: liveRound.id,
        scheduledStartAt: liveRound.auctionStartsAt,
        scheduledEndAt: liveRound.auctionEndsAt,
      },
      tx,
    );

    sellerActivityClient.recordActivity(user.id);

    return auctionItem;
  });
}

/** Marketing approves a pending auction. */
async function approve({ user, auctionId }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์อนุมัติรายการประมูล");
  }

  const auction = await loadAuction(auctionId);
  if (auction.round?.cancelledAt) {
    throw badRequest("ไม่สามารถอนุมัติรายการสินค้าในรอบประมูลที่ถูกยกเลิกได้");
  }

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
  if (round.cancelledAt) return "cancelled";
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
    categories,
  } = input;
  if (!title || typeof title !== "string" || !title.trim()) {
    throw badRequest("กรุณากรอกชื่อรอบการประมูลให้ครบถ้วน");
  }

  let roundCategories = [];
  if (categories !== undefined && categories !== null) {
    if (!Array.isArray(categories)) {
      throw badRequest(
        "รูปแบบหมวดหมู่สินค้าไม่ถูกต้อง หมวดหมู่ต้องเป็นรายการ (array)",
      );
    }
    if (categories.length > 0) {
      for (const item of categories) {
        if (typeof item !== "string" || !item.trim()) {
          throw badRequest("ชื่อหมวดหมู่ต้องเป็นข้อความที่ไม่ว่างเปล่า");
        }
      }
      const uniqueCats = [
        ...new Set(categories.map((c) => c.trim()).filter(Boolean)),
      ];
      if (uniqueCats.length === 0) {
        throw badRequest(
          "กรุณาระบุหมวดหมู่อย่างน้อยหนึ่งหมวดหมู่ หรือเลือกรับทุกหมวดหมู่",
        );
      }
      const knownCategories = await auctionRepository.listCategories();
      const knownSet = new Set(knownCategories.map((c) => c.name));
      for (const cat of uniqueCats) {
        if (!knownSet.has(cat)) {
          throw badRequest(`หมวดหมู่ "${cat}" ไม่มีอยู่ในระบบ`);
        }
      }
      roundCategories = uniqueCats;
    }
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

  return runInTransaction(async (tx) => {
    const round = await auctionRepository.createRound(
      {
        title: title.trim(),
        categories: roundCategories,
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

/** Get current round status, active submission rounds, and active auction rounds. */
async function getCurrentRound(now = new Date()) {
  const [activeSubmissionRounds, activeAuctionRounds, upcomingRounds] =
    await Promise.all([
      auctionRepository.findActiveSubmissionRounds
        ? auctionRepository.findActiveSubmissionRounds(now)
        : [],
      auctionRepository.findActiveAuctionRounds
        ? auctionRepository.findActiveAuctionRounds(now)
        : [],
      auctionRepository.findUpcomingRounds
        ? auctionRepository.findUpcomingRounds(now)
        : [],
    ]);

  const isSubmissionOpen = activeSubmissionRounds.length > 0;
  const isAuctionActive = activeAuctionRounds.length > 0;
  const nextRound = upcomingRounds[0] || null;

  const round =
    activeAuctionRounds[0] || activeSubmissionRounds[0] || nextRound || null;

  const phase = round ? deriveRoundPhase(round, now) : null;

  return {
    round,
    phase,
    isSubmissionOpen,
    isAuctionActive,
    activeSubmissionRounds: activeSubmissionRounds.map((r) => ({
      ...r,
      phase: deriveRoundPhase(r, now),
    })),
    activeAuctionRounds: activeAuctionRounds.map((r) => ({
      ...r,
      phase: deriveRoundPhase(r, now),
    })),
    nextRound: nextRound
      ? { ...nextRound, phase: deriveRoundPhase(nextRound, now) }
      : null,
  };
}

/** Public buyer browsing of active and upcoming auction rounds (including cancelled rounds until auctionEndsAt). */
async function browseRounds(now = new Date()) {
  const [activeAuctionRounds, upcomingRounds] = await Promise.all([
    auctionRepository.findActiveAuctionRounds
      ? auctionRepository.findActiveAuctionRounds(now, {
          includeCancelled: true,
        })
      : [],
    auctionRepository.findUpcomingRounds
      ? auctionRepository.findUpcomingRounds(now, {
          includeCancelled: true,
        })
      : [],
  ]);

  const isBeforeAuctionEnd = (r) =>
    !r.auctionEndsAt || new Date(r.auctionEndsAt) > now;

  return {
    activeAuctionRounds: activeAuctionRounds
      .filter(isBeforeAuctionEnd)
      .map((r) => ({
        ...r,
        visibleItemCount: r.visibleItemCount ?? r._count?.auctions ?? 0,
        phase: deriveRoundPhase(r, now),
      })),
    upcomingRounds: upcomingRounds.filter(isBeforeAuctionEnd).map((r) => ({
      ...r,
      visibleItemCount: r.visibleItemCount ?? r._count?.auctions ?? 0,
      phase: deriveRoundPhase(r, now),
    })),
  };
}

/** Get a single round by ID. */
async function getRound(roundId, now = new Date()) {
  if (!roundId) throw badRequest("กรุณาระบุรหัสรอบการประมูล");
  const round = await auctionRepository.findRoundForSubmission(roundId);
  if (!round) throw notFound("ไม่พบรอบประมูลที่เลือก กรุณากลับไปเลือกรอบใหม่");
  return {
    ...round,
    phase: deriveRoundPhase(round, now),
  };
}

/** List items belonging to a specific round for public buyer view. */
async function listRoundItems(roundId, now = new Date()) {
  if (!roundId) throw badRequest("กรุณาระบุรหัสรอบการประมูล");
  const roundData = await auctionRepository.findRoundWithItems(roundId);
  if (!roundData) {
    throw notFound("ไม่พบรอบประมูลที่เลือก กรุณากลับไปเลือกรอบใหม่");
  }
  const { auctions, ...round } = roundData;
  const rawItems = auctions || [];
  const reconciled = await Promise.all(
    rawItems.map((item) => maybeAdvance(item, now)),
  );
  const items = reconciled.filter(
    (item) =>
      item &&
      ["open", "scheduled", "cancelled"].includes(item.status) &&
      new Date(item.scheduledEndAt) > now,
  );
  return {
    round: {
      ...round,
      visibleItemCount: items.length,
      phase: deriveRoundPhase(round, now),
    },
    items,
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

/**
 * Marketing cancels a single approved, scheduled, or open auction item with reason, lock, audit, and chat notification.
 * Idempotent when called again on an already-cancelled item: does not re-mutate state or re-write audit logs,
 * and retries chat notifications using deterministic idempotency keys.
 */
async function cancel({ user, auctionId, reason, cancellationReason }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์ยกเลิกการประมูล");
  }

  const rawReason =
    cancellationReason !== undefined ? cancellationReason : reason;
  if (typeof rawReason !== "string" || !rawReason.trim()) {
    throw badRequest("กรุณาระบุเหตุผลในการยกเลิกรายการประมูล");
  }
  const trimmedReason = rawReason.trim();
  if (trimmedReason.length > MAX_CANCELLATION_REASON_LENGTH) {
    throw badRequest(
      `เหตุผลในการยกเลิกรายการประมูลต้องมีความยาวไม่เกิน ${MAX_CANCELLATION_REASON_LENGTH} ตัวอักษร`,
    );
  }

  const { updatedAuction, round, previousStatus, bidderIds, idempotentRetry } =
    await runWithAuctionLock(auctionId, async (tx) => {
      let auction = null;
      if (
        typeof tx?.$executeRaw === "function" &&
        typeof tx?.auctionItem?.findUnique === "function"
      ) {
        auction = await tx.auctionItem.findUnique({
          where: { id: auctionId },
          include: {
            product: true,
            round: true,
            bids: { select: { bidderId: true } },
          },
        });
      } else {
        auction = await auctionRepository.findById(auctionId, tx);
      }

      if (!auction) throw notFound("ไม่พบข้อมูลรายการประมูลที่ระบุ");

      const uniqueBidders = [
        ...new Set((auction.bids || []).map((b) => b.bidderId).filter(Boolean)),
      ];

      if (auction.status === "cancelled") {
        const wasOpen = Boolean(auction.openedAt || uniqueBidders.length > 0);
        return {
          updatedAuction: auction,
          round: auction.round || null,
          previousStatus: wasOpen ? "open" : "cancelled",
          sellerId: auction.sellerId,
          bidderIds: uniqueBidders,
          idempotentRetry: true,
        };
      }

      if (auction.round?.cancelledAt) {
        throw badRequest("รอบประมูลนี้ถูกยกเลิกไปแล้ว");
      }
      if (auction.winningOrderId) {
        throw badRequest(
          "ไม่สามารถยกเลิกรายการประมูลที่สร้างคำสั่งซื้อแล้วได้",
        );
      }
      if (auction.status === "pending_approval") {
        throw badRequest(
          "รายการที่อยู่ในสถานะรอการอนุมัติต้องใช้การปฏิเสธสินค้า (Reject) ไม่สามารถยกเลิกได้",
        );
      }
      if (!["approved", "scheduled", "open"].includes(auction.status)) {
        throw conflict(
          `ไม่สามารถเปลี่ยนสถานะรายการประมูลจาก "${getStatusThai(auction.status)}" เป็น "${getStatusThai("cancelled")}" ได้ในขณะนี้`,
        );
      }

      const now = new Date();
      await auctionRepository.setProductStatus(
        auction.productId,
        "auction_action_required",
        tx,
      );
      const res = await auctionRepository.updateStatus(
        auctionId,
        {
          status: "cancelled",
          cancellationReason: trimmedReason,
          cancelledAt: now,
          cancelledBy: user.id,
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
          previousState: {
            id: auction.id,
            status: auction.status,
            roundId: auction.roundId || null,
            productId: auction.productId,
          },
          newState: {
            id: res.id,
            status: res.status,
            cancellationReason: trimmedReason,
            cancelledAt: now,
            cancelledBy: user.id,
          },
          metadata: {
            cancellationReason: trimmedReason,
            roundId: auction.roundId || null,
            productId: auction.productId,
            previousStatus: auction.status,
            affectedBidderCount: uniqueBidders.length,
          },
          idempotencyKey: `AUCTION_ITEM_CANCEL:${auctionId}`,
        },
        { tx },
      );

      return {
        updatedAuction: res,
        round: auction.round || res.round || null,
        previousStatus: auction.status,
        sellerId: auction.sellerId || res.sellerId,
        bidderIds: uniqueBidders,
        idempotentRetry: false,
      };
    });

  if (!idempotentRetry) {
    await auctionCloseQueue.cancelClose(auctionId);
  }

  const effectiveReason = updatedAuction?.cancellationReason || trimmedReason;
  const chatResult = await chatClient.notifyItemCancelled({
    item: updatedAuction,
    round,
    reason: effectiveReason,
    wasOpen: previousStatus === "open",
    sellerId: updatedAuction?.sellerId,
    bidderIds,
  });

  return {
    ...updatedAuction,
    ...(idempotentRetry ? { idempotentRetry: true } : {}),
    warnings: chatResult?.warnings || [],
  };
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
      include: { round: true },
    });
    if (!auction) throw notFound("ไม่พบข้อมูลรายการประมูลที่ระบุ");
    if (auction.status === "cancelled" || auction.round?.cancelledAt) {
      throw conflict("รอบประมูลนี้ถูกยกเลิกแล้ว ไม่สามารถเสนอราคาได้");
    }
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

/**
 * Marketing cancels an entire auction round atomically with audit logging and notifications.
 * Idempotent when called again on an already-cancelled round: does not re-mutate state or re-write audit logs,
 * and retries chat notifications using deterministic idempotency keys.
 */
async function cancelRound({ user, roundId, reason }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์ยกเลิกรอบการประมูล");
  }

  if (typeof reason !== "string" || !reason.trim()) {
    throw badRequest("กรุณาระบุเหตุผลในการยกเลิกรอบประมูล");
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length > MAX_CANCELLATION_REASON_LENGTH) {
    throw badRequest(
      `เหตุผลในการยกเลิกรอบประมูลต้องมีความยาวไม่เกิน ${MAX_CANCELLATION_REASON_LENGTH} ตัวอักษร`,
    );
  }

  const {
    cancelledRound,
    activeAuctions,
    sellerIds,
    bidderIds,
    idempotentRetry,
  } = await auctionRepository.withRoundLock(roundId, async (tx) => {
    const round = await tx.auctionRound.findUnique({
      where: { id: roundId },
      include: {
        auctions: {
          include: {
            product: true,
            bids: true,
          },
        },
      },
    });

    if (!round) {
      throw notFound("ไม่พบรอบการประมูลที่ระบุ");
    }

    if (round.cancelledAt) {
      const cancelledItems = (round.auctions || []).filter(
        (a) => a.status === "cancelled",
      );
      const uniqueSellerIds = [
        ...new Set(cancelledItems.map((a) => a.sellerId).filter(Boolean)),
      ];
      const cancelledAtTime = new Date(round.cancelledAt);
      const wasAuctionPhase =
        round.auctionStartsAt &&
        round.auctionEndsAt &&
        new Date(round.auctionStartsAt) <= cancelledAtTime &&
        cancelledAtTime < new Date(round.auctionEndsAt);
      const hasAnyBids = (round.auctions || []).some(
        (a) => Array.isArray(a.bids) && a.bids.length > 0,
      );
      const uniqueBidderIds =
        wasAuctionPhase || hasAnyBids
          ? [
              ...new Set(
                (round.auctions || [])
                  .flatMap((a) => (a.bids || []).map((b) => b.bidderId))
                  .filter(Boolean),
              ),
            ]
          : [];
      return {
        cancelledRound: {
          ...round,
          cancellationReason: round.cancellationReason || trimmedReason,
        },
        activeAuctions: [],
        sellerIds: uniqueSellerIds,
        bidderIds: uniqueBidderIds,
        idempotentRetry: true,
      };
    }

    const now = new Date();
    const phase = deriveRoundPhase(round, now);
    if (phase === "ended") {
      throw badRequest("ไม่สามารถยกเลิกรอบประมูลที่สิ้นสุดแล้วได้");
    }

    const hasWinningOrder = (round.auctions || []).some(
      (a) => a.winningOrderId,
    );
    if (hasWinningOrder) {
      throw badRequest(
        "ไม่สามารถยกเลิกรอบประมูลที่มีรายการสร้างคำสั่งซื้อแล้วได้",
      );
    }

    const cancelledRoundRecord = await tx.auctionRound.update({
      where: { id: roundId },
      data: {
        cancelledAt: now,
        cancelledBy: user.id,
        cancellationReason: trimmedReason,
      },
    });

    const activeList = (round.auctions || []).filter((a) =>
      ["draft", "pending_approval", "approved", "scheduled", "open"].includes(
        a.status,
      ),
    );

    if (activeList.length > 0) {
      const activeIds = activeList.map((a) => a.id);
      await tx.auctionItem.updateMany({
        where: { id: { in: activeIds } },
        data: {
          status: "cancelled",
          cancellationReason: trimmedReason,
          cancelledAt: now,
          cancelledBy: user.id,
        },
      });

      const productIds = [
        ...new Set(activeList.map((a) => a.productId).filter(Boolean)),
      ];
      if (productIds.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: "auction_action_required" },
        });
      }
    }

    const affectedItemCount = activeList.length;
    const uniqueSellerIds = [
      ...new Set(activeList.map((a) => a.sellerId).filter(Boolean)),
    ];
    const affectedSellerCount = uniqueSellerIds.length;

    // Only notify bidders if round was cancelled during active auction phase
    const uniqueBidderIds =
      phase === "auction"
        ? [
            ...new Set(
              (round.auctions || [])
                .flatMap((a) => (a.bids || []).map((b) => b.bidderId))
                .filter(Boolean),
            ),
          ]
        : [];
    const affectedBidderCount = uniqueBidderIds.length;

    await recordMarketingAudit(
      {
        actorId: user.id,
        actorRole: user.role,
        action: "AUCTION_ROUND_CANCEL",
        entityType: "AUCTION_ROUND",
        entityId: roundId,
        previousState: {
          id: round.id,
          title: round.title,
          phase,
          cancelledAt: round.cancelledAt,
        },
        newState: {
          id: cancelledRoundRecord.id,
          title: cancelledRoundRecord.title,
          phase: "cancelled",
          cancelledAt: cancelledRoundRecord.cancelledAt,
          cancelledBy: user.id,
          cancellationReason: trimmedReason,
        },
        metadata: {
          cancellationReason: trimmedReason,
          roundId,
          productIds: [
            ...new Set(activeList.map((a) => a.productId).filter(Boolean)),
          ],
          affectedItemCount,
          affectedSellerCount,
          affectedBidderCount,
          sellerIds: uniqueSellerIds,
          bidderIds: uniqueBidderIds,
        },
        idempotencyKey: `AUCTION_ROUND_CANCEL:${roundId}`,
      },
      { tx },
    );

    return {
      cancelledRound: cancelledRoundRecord,
      activeAuctions: activeList,
      sellerIds: uniqueSellerIds,
      bidderIds: uniqueBidderIds,
      idempotentRetry: false,
    };
  });

  if (!idempotentRetry) {
    // Cancel BullMQ scheduled close jobs for all active items in the round
    await Promise.allSettled(
      activeAuctions.map((a) => auctionCloseQueue.cancelClose(a.id)),
    );
  }

  // Send non-blocking chat notifications
  const chatResult = await chatClient.notifyRoundCancelled({
    round: cancelledRound,
    sellerIds,
    bidderIds,
  });

  return {
    ...cancelledRound,
    phase: "cancelled",
    ...(idempotentRetry ? { idempotentRetry: true } : {}),
    warnings: chatResult?.warnings || [],
  };
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
  browseRounds,
  getRound,
  listRoundItems,
  listRounds,
  deriveRoundPhase,
  cancelRound,
  isCategoryAllowedInRound,
};
