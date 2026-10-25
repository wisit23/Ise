const {
  AppError,
  badRequest,
  forbidden,
  notFound,
  conflict,
  AUCTION_PAYMENT_TTL_MS,
} = require("@reloop/shared");
const auctionRepository = require("./auctionRepository");
const defaultPrisma = require("../../models/prismaClient");
const { hydrateRound, hydrateItem, writeRound, saveFields } = require("./auctionAuditState");
const { recordMarketingAudit } = require("../audit/marketingAuditService");
const orderClient = require("./orderClient");
const auctionCloseQueue = require("../../jobs/auctionCloseQueue");
const chatClient = require("./chatClient");
const { getDisplayNames: getBidderNames, maskBidderName } = require("./authClient");
const auctionRealtime = require("./auctionRealtime");
const MAX_CANCELLATION_REASON_LENGTH = 500;
const MAX_BID_AMOUNT = 1_000_000;
const BID_COOLDOWN_MS = 2_000;
const { requireRoundCapacity, assertRoundHasCapacity } = require("./roundCapacity");

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
const {
  getDisplayNames,
  searchUsers,
} = require("../audit/marketingAuditAuthClient");

const AUCTION_STATUSES = new Set([
  "draft",
  "pending_approval",
  "rejected",
  "approved",
  "scheduled",
  "open",
  "closed",
  "cancelled",
]);
const MAX_AUCTION_FILTER_VALUES = 100;
const MAX_AUCTION_SEARCH_LENGTH = 100;
const AUCTION_ROUND_PHASES = new Set([
  "upcoming",
  "submission",
  "waiting",
  "auction",
  "ended",
  "cancelled",
]);

function maskBidderDisplayName(displayName, userId) {
  const clean = typeof displayName === "string" ? displayName.trim() : "";
  if (!clean) return maskBidderName(userId);
  const characters = Array.from(clean);
  if (characters.length === 1) return `${characters[0]}***`;
  return `${characters[0]}***${characters[characters.length - 1]}`;
}

function isCategoryAllowedInRound(round, category) {
  if (!round) return false;
  const cats = round.categories;
  if (!Array.isArray(cats) || cats.length === 0) {
    return true;
  }
  return (Array.isArray(category) ? category : [category]).some((name) => cats.includes(name));
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
  if(auction.product?.moderatedAt || auction.product?.status === "removed")return auction;
  if (auction.status === "scheduled" && auction.scheduledStartAt <= now) {
    try {
      auction = await auctionRepository.updateStatus(auction.id, {
        status: "open",
        openedAt: now,
      }, { expectedStatus: "scheduled", strictStatus: true, requireUnmoderatedProduct: true, startDueAt: now });
    } catch (err) {
      // A delayed job and a page visit may race; only the transition winner notifies.
      if (err.status !== 409) throw err;
      return loadAuction(auction.id);
    }
    if (auction.status === "open") {
      await chatClient.notifyItemOpened(auction).catch((err) =>
        console.warn("[auctionService] opening notification failed:", err.message),
      );
    }
  }
  if (auction.status === "open" && auction.scheduledEndAt <= now) {
    auction = await closeAuction(auction, now);
  }
  return auction;
}

async function closeAuction(auction, now = new Date()) {
  const auctionId = typeof auction === "string" ? auction : auction?.id;
  let winnerNotification = null;

  const result = await runWithAuctionLock(auctionId, async (tx) => {
    let current = null;
    if (
      typeof tx?.$executeRaw === "function" &&
      typeof tx?.auctionItem?.findUnique === "function"
    ) {
      current = await hydrateItem(tx, await tx.auctionItem.findUnique({
        where: { id: auctionId },
        include: {
          product: { include: { photos: { orderBy: { position: "asc" } } } },
          round: true,
        },
      }));
    } else {
      current = await auctionRepository.findById(auctionId, tx);
    }

    if (
      !current ||
      current.status === "closed" ||
      current.status === "cancelled" ||
      current.round?.cancelledAt || current.product?.moderatedAt || current.product?.status === "removed"
    ) {
      return current || auction;
    }

    // A bid or round edit may have moved the deadline while this close waited for its lock.
    if (current.scheduledEndAt && new Date(current.scheduledEndAt) > now) return current;
    const winningBid = await auctionRepository.highestBid(current.id, tx);

    let winningOrderId = null;
    if (winningBid) {
      const order = await orderClient.createOrderFromAuction({
        auctionId: current.id,
        auctionBidId: winningBid.id,
        productId: current.productId,
        productTitle: current.product?.title,
        sellerId: current.sellerId,
        buyerId: winningBid.bidderId,
        price: winningBid.amount,
        paymentDeadlineAt: new Date(now.getTime() + AUCTION_PAYMENT_TTL_MS),
      });
      winningOrderId = order.id;
      await auctionRepository.setProductStatus(current.productId, "reserved", tx, {
        price: winningBid.amount,
      });
      winnerNotification = {
        auction: {
          id: current.id,
          roundId: current.roundId,
          sellerId: current.sellerId,
          productId: current.productId,
          productTitle: current.product?.title,
        },
        order: {
          id: order.id,
          buyerId: winningBid.bidderId,
          auctionBidId: winningBid.id,
          price: winningBid.amount,
          paymentDeadlineAt: order.paymentDeadlineAt,
        },
      };
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
  if (winnerNotification) {
    const names = await getBidderNames([winnerNotification.order.buyerId]);
    await chatClient.notifyAuctionWinnerAssigned({
      ...winnerNotification,
      winnerName:
        names.get(winnerNotification.order.buyerId) ||
        maskBidderName(winnerNotification.order.buyerId),
    });
  }
  auctionRealtime.publish(auctionId, "auction.closed");
  return result;
}

async function advanceWinnerAfterPaymentTimeout({
  auctionId,
  currentBidId,
  orderId,
  expiredBuyerId,
  now = new Date(),
}) {
  if (!auctionId || !orderId) {
    throw badRequest("auctionId and orderId are required");
  }

  const result = await runWithAuctionLock(auctionId, async (tx) => {
    const current = await auctionRepository.findById(auctionId, tx);
    if (!current) throw notFound("ไม่พบข้อมูลรายการประมูลที่ระบุ");
    if (current.status !== "closed") {
      throw conflict("รายการประมูลไม่อยู่ในสถานะรอจัดสรรผู้ชนะ");
    }

    const rankedBids = Array.isArray(current.bids) ? current.bids : [];
    if (current.winningOrderId !== orderId) {
      const assigned = rankedBids.find((bid) => bid.id === current.winningBidId);
      if (!assigned && !current.winningBidId) {
        return {
          outcome: "released",
          auctionId,
          productId: current.productId,
          alreadyAdvanced: true,
        };
      }
      if (!assigned || !current.winningOrderId) {
        throw conflict("รายการประมูลไม่อยู่ในสถานะรอจัดสรรผู้ชนะ");
      }
      return {
        outcome: "reassigned",
        auctionId,
        bidId: assigned.id,
        buyerId: assigned.bidderId,
        price: assigned.amount,
        productId: current.productId,
        orderId: current.winningOrderId,
        alreadyAdvanced: true,
      };
    }

    if (!current.winningBidId) {
      return { outcome: "released", auctionId, productId: current.productId };
    }

    let effectiveCurrentBidId = currentBidId;
    if (!effectiveCurrentBidId) {
      const assigned = rankedBids.find((bid) => bid.id === current.winningBidId);
      if (!assigned) {
        throw conflict("ไม่พบข้อมูลผู้ชนะลำดับปัจจุบัน");
      }
      // Orders created before auction_bid_id existed rely on the expired buyer
      // to distinguish the first attempt from a retry after Product advanced.
      if (expiredBuyerId && assigned.bidderId !== expiredBuyerId) {
        return {
          outcome: "reassigned",
          auctionId,
          bidId: assigned.id,
          buyerId: assigned.bidderId,
          price: assigned.amount,
          productId: current.productId,
          orderId: current.winningOrderId,
          alreadyAdvanced: true,
        };
      }
      effectiveCurrentBidId = current.winningBidId;
    }

    // A retry may arrive after Product already advanced but before Order saved
    // the reassignment. Return the current candidate instead of skipping them.
    if (current.winningBidId !== effectiveCurrentBidId) {
      const assigned = rankedBids.find((bid) => bid.id === current.winningBidId);
      if (!assigned) {
        throw conflict("ไม่พบข้อมูลผู้ชนะลำดับปัจจุบัน");
      }
      return {
        outcome: "reassigned",
        auctionId,
        bidId: assigned.id,
        buyerId: assigned.bidderId,
        price: assigned.amount,
        productId: current.productId,
        orderId: current.winningOrderId,
        alreadyAdvanced: true,
      };
    }

    const currentIndex = rankedBids.findIndex(
      (bid) => bid.id === effectiveCurrentBidId,
    );
    if (currentIndex < 0) throw conflict("ไม่พบราคาเสนอของผู้ชนะปัจจุบัน");

    const attemptedBidders = new Set(
      rankedBids
        .slice(0, currentIndex + 1)
        .map((bid) => bid.bidderId)
        .filter(Boolean),
    );
    if (expiredBuyerId) attemptedBidders.add(expiredBuyerId);
    const nextBid = rankedBids
      .slice(currentIndex + 1)
      .find((bid) => !attemptedBidders.has(bid.bidderId));

    if (!nextBid) {
      const released = await auctionRepository.updateStatus(
        current.id,
        { winningBidId: null, winningOrderId: null },
        tx,
      );
      await auctionRepository.setProductStatus(
        current.productId,
        "auction_action_required",
        tx,
      );
      await recordMarketingAudit(
        {
          actorId: "SYSTEM",
          actorRole: "SYSTEM",
          action: "AUCTION_PAYMENT_EXPIRED_NO_NEXT_BIDDER",
          entityType: "AUCTION_ITEM",
          entityId: current.id,
          previousState: current,
          newState: released,
          metadata: {
            expiredBuyerId,
            expiredBidId: effectiveCurrentBidId,
            orderId,
          },
          idempotencyKey: `AUCTION_PAYMENT_EXPIRED_NO_NEXT_BIDDER:${current.id}:${effectiveCurrentBidId}`,
        },
        { tx },
      );
      return { outcome: "released", auctionId, productId: current.productId };
    }

    const paymentDeadlineAt = new Date(
      now.getTime() + AUCTION_PAYMENT_TTL_MS,
    );
    const nextOrder = await orderClient.createOrderFromAuction({
      auctionId: current.id,
      auctionBidId: nextBid.id,
      productId: current.productId,
      productTitle: current.product?.title,
      sellerId: current.sellerId,
      buyerId: nextBid.bidderId,
      price: nextBid.amount,
      paymentDeadlineAt,
      previousOrderId: orderId,
    });

    const updated = await auctionRepository.updateStatus(
      current.id,
      { winningBidId: nextBid.id, winningOrderId: nextOrder.id },
      tx,
    );
    await auctionRepository.setProductStatus(current.productId, "reserved", tx, {
      price: nextBid.amount,
    });
    await recordMarketingAudit(
      {
        actorId: "SYSTEM",
        actorRole: "SYSTEM",
        action: "AUCTION_WINNER_ADVANCE",
        entityType: "AUCTION_ITEM",
        entityId: current.id,
        previousState: current,
        newState: updated,
        metadata: {
          expiredBuyerId,
          expiredBidId: effectiveCurrentBidId,
          nextBuyerId: nextBid.bidderId,
          nextBidId: nextBid.id,
          previousOrderId: orderId,
          nextOrderId: nextOrder.id,
        },
        idempotencyKey: `AUCTION_WINNER_ADVANCE:${current.id}:${effectiveCurrentBidId}:${nextBid.id}`,
      },
      { tx },
    );

    return {
      outcome: "reassigned",
      auctionId,
      bidId: nextBid.id,
      buyerId: nextBid.bidderId,
      price: nextBid.amount,
      productId: current.productId,
      orderId: nextOrder.id,
      paymentDeadlineAt,
    };
  });

  const notificationAuction = await auctionRepository.findById(auctionId);
  if (!notificationAuction) return result;
  if (
    result?.outcome === "reassigned" &&
    result.orderId &&
    notificationAuction?.sellerId
  ) {
    const names = await getBidderNames([result.buyerId]);
    await chatClient.notifyAuctionWinnerAssigned({
      auction: {
        id: notificationAuction.id,
        roundId: notificationAuction.roundId,
        sellerId: notificationAuction.sellerId,
        productId: notificationAuction.productId,
        productTitle: notificationAuction.product?.title,
      },
      order: {
        id: result.orderId,
        buyerId: result.buyerId,
        auctionBidId: result.bidId,
        price: result.price,
        paymentDeadlineAt: result.paymentDeadlineAt,
      },
      winnerName:
        names.get(result.buyerId) || maskBidderName(result.buyerId),
      previousWinnerId: expiredBuyerId,
      previousBidId: currentBidId,
      previousOrderId: orderId,
    });
  } else if (result?.outcome === "released") {
    await chatClient.notifyAuctionExhausted({
      auction: {
        id: notificationAuction.id,
        roundId: notificationAuction.roundId,
        sellerId: notificationAuction.sellerId,
        productId: notificationAuction.productId,
        productTitle: notificationAuction.product?.title,
      },
      expiredBuyerId,
      expiredBidId: currentBidId,
      expiredOrderId: orderId,
    });
  }
  return result;
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
        if(product.moderatedAt || product.status === "removed")throw forbidden("a moderated product cannot enter an auction");
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
          !isCategoryAllowedInRound(chosenRound, product.categories || product.category) ||
          !isCategoryAllowedInRound(liveRound, product.categories || product.category)
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

        await assertRoundHasCapacity(liveRound, tx);
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

  const productData = buildCreateProductData(user.id, {
    ...input, category, price: startingPrice, status: "auction",
  });
  const productCategories = productData.categories || [category];
  for (const name of productCategories) {
    if (!(await auctionRepository.findCategory(name))) {
      throw badRequest(`หมวดหมู่ "${name}" ไม่มีอยู่ในระบบ`);
    }
  }
  if (!isCategoryAllowedInRound(chosenRound, productCategories)) {
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
    if (!isCategoryAllowedInRound(liveRound, productCategories)) {
      throw badRequest(
        `รอบประมูลนี้ไม่เปิดรับสินค้าหมวดหมู่ ‘${category}’ กรุณาเลือกรอบอื่นหรือเปลี่ยนหมวดหมู่สินค้า`,
      );
    }

    await assertRoundHasCapacity(liveRound, tx);
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
  if(auction.product?.moderatedAt || auction.product?.status === "removed")throw conflict("auction product is unavailable due to moderation");
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
        { expectedStatus: auction.status, strictStatus: true },
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
    await auctionCloseQueue.scheduleClose(auctionId, auction.scheduledEndAt, auction.scheduledStartAt);
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
      { expectedStatus: auction.status, strictStatus: true },
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

/** Marketing rejects a pending auction and records the required reason. */
async function reject({ user, auctionId, reason }) {
  if (user?.role !== "MARKETING") {
    throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์ปฏิเสธรายการประมูล");
  }

  if (typeof reason !== "string" || !reason.trim()) {
    throw badRequest("กรุณาระบุเหตุผลในการปฏิเสธสินค้า");
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length > MAX_CANCELLATION_REASON_LENGTH) {
    throw badRequest(
      `เหตุผลในการปฏิเสธสินค้าต้องมีความยาวไม่เกิน ${MAX_CANCELLATION_REASON_LENGTH} ตัวอักษร`,
    );
  }

  const auction = await loadAuction(auctionId);
  if (auction.status === "rejected") {
    const chatResult = await chatClient.notifyItemRejected({
      item: auction,
      round: auction.round,
      reason: auction.cancellationReason || trimmedReason,
    });
    return {
      ...auction,
      idempotentRetry: true,
      warnings: chatResult?.warnings || [],
    };
  }
  assertTransition(auction, "rejected");

  const updated = await runInTransaction(async (tx) => {
    await auctionRepository.setProductStatus(
      auction.productId,
      "available",
      tx,
    );
    const updated = await auctionRepository.updateStatus(
      auctionId,
      { status: "rejected", cancellationReason: trimmedReason },
      tx,
      { expectedStatus: auction.status, strictStatus: true },
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
        metadata: { reason: trimmedReason },
      },
      { tx },
    );
    return updated;
  });

  const chatResult = await chatClient.notifyItemRejected({
    item: updated,
    round: updated.round || auction.round,
    reason: trimmedReason,
  });

  return { ...updated, warnings: chatResult?.warnings || [] };
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

  if (subStart < new Date()) {
    throw badRequest(
      "เวลาเริ่มเปิดรับสินค้าต้องเป็นเวลาปัจจุบันหรืออนาคต",
    );
  }

  const maxItems = requireRoundCapacity(input.maxItems);
  const round = await runInTransaction(async (tx) => {
    const round = await auctionRepository.createRound(
      {
        title: title.trim(),
        maxItems,
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

  if (typeof chatClient?.notifyRoundOpened === "function") {
    chatClient.notifyRoundOpened(round).catch(() => {});
  }

  return round;
}

/** Get current round status, active submission rounds, and active auction rounds. */
async function getCurrentRound(now = new Date()) {
  let [activeSubmissionRounds, activeAuctionRounds, upcomingRounds] =
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

  [activeSubmissionRounds, activeAuctionRounds, upcomingRounds] = await Promise.all(
    [activeSubmissionRounds, activeAuctionRounds, upcomingRounds].map(rounds => auctionRepository.addCapacityCounts(rounds)),
  );
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

/** Public buyer browsing of active and upcoming non-cancelled auction rounds. */
async function browseRounds(now = new Date()) {
  const [activeAuctionRounds, upcomingRounds] = await Promise.all([
    auctionRepository.findActiveAuctionRounds
      ? auctionRepository.findActiveAuctionRounds(now)
      : [],
    auctionRepository.findUpcomingRounds
      ? auctionRepository.findUpcomingRounds(now)
      : [],
  ]);

  const isVisibleRound = (r) =>
    !r.cancelledAt &&
    (!r.auctionEndsAt ||
      new Date(r.auctionEndsAt) > now ||
      (r.visibleItemCount ?? r._count?.auctions ?? 0) > 0);

  const presentRound = (r) => {
    const visibleItemCount = r.visibleItemCount ?? r._count?.auctions ?? 0;
    const basePhase = deriveRoundPhase(r, now);
    return {
      ...r,
      visibleItemCount,
      phase:
        basePhase === "ended" && visibleItemCount > 0 ? "auction" : basePhase,
      isSoftCloseActive:
        Boolean(r.auctionEndsAt) &&
        new Date(r.auctionEndsAt) <= now &&
        visibleItemCount > 0,
    };
  };

  return {
    activeAuctionRounds: activeAuctionRounds
      .filter(isVisibleRound)
      .map(presentRound),
    upcomingRounds: upcomingRounds.filter(isVisibleRound).map(presentRound),
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
      ["open", "scheduled"].includes(item.status) &&
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
async function listRounds({ user, skip, take, phases = [], search = "" } = {}) {
  if (user?.role !== "MARKETING") {
    throw forbidden(
      "เฉพาะฝ่ายการตลาดเท่านั้นที่มีสิทธิ์ดูรายการรอบการประมูลทั้งหมด",
    );
  }
  const isPaginated = typeof skip === "number" && typeof take === "number";
  const now = new Date();
  const effectivePhases = [...new Set(Array.isArray(phases) ? phases : [])];
  const unknownPhase = effectivePhases.find((phase) => !AUCTION_ROUND_PHASES.has(phase));
  if (unknownPhase) {
    throw badRequest("สถานะรอบประมูลที่ใช้กรองไม่ถูกต้อง");
  }
  const cleanSearch = typeof search === "string" ? search.trim() : "";
  if (cleanSearch.length > MAX_AUCTION_SEARCH_LENGTH) {
    throw badRequest(`คำค้นหาต้องไม่เกิน ${MAX_AUCTION_SEARCH_LENGTH} ตัวอักษร`);
  }

  const hasFilters = effectivePhases.length > 0 || cleanSearch.length > 0;

  if (hasFilters) {
    const raw = await auctionRepository.listRounds();
    const hydrated = await auctionRepository.addCapacityCounts(
      Array.isArray(raw) ? raw : raw?.items || [],
    );
    const normalizedSearch = cleanSearch.toLocaleLowerCase("th-TH");
    const filtered = hydrated
      .map((round) => ({
        ...round,
        phase: deriveRoundPhase(round, now),
      }))
      .filter((round) =>
        effectivePhases.length === 0 || effectivePhases.includes(round.phase),
      )
      .filter((round) =>
        !normalizedSearch ||
        (require("@reloop/shared").normalizeReferenceCode(cleanSearch, "RND") === round.referenceCode && Boolean(round.referenceCode)) ||
        String(round.title || "").toLocaleLowerCase("th-TH").includes(normalizedSearch),
      );

    if (!isPaginated) return filtered;
    return {
      items: filtered.slice(skip, skip + take),
      total: filtered.length,
    };
  }

  if (!isPaginated) {
    const raw = await auctionRepository.listRounds();
    const rounds = await auctionRepository.addCapacityCounts(Array.isArray(raw) ? raw : raw?.items || []);
    return rounds.map((r) => ({
      ...r,
      phase: deriveRoundPhase(r, now),
    }));
  }

  const result = await auctionRepository.listRounds({ skip, take });
  const items = await auctionRepository.addCapacityCounts(result.items || []);
  const { total } = result;
  return {
    items: (items || []).map((r) => ({
      ...r,
      phase: deriveRoundPhase(r, now),
    })),
    total,
  };
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

  // Both boundaries must fire even when nobody visits the auction page.
  await auctionCloseQueue.scheduleClose(auctionId, end, start);

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
        auction = await hydrateItem(tx, await tx.auctionItem.findUnique({
          where: { id: auctionId },
          include: {
            product: true,
            round: true,
            bids: { select: { bidderId: true } },
          },
        }));
      } else {
        auction = await auctionRepository.findById(auctionId, tx);
      }

      if (!auction) throw notFound("ไม่พบข้อมูลรายการประมูลที่ระบุ");
    if(auction.product?.moderatedAt || auction.product?.status === "removed")throw conflict("auction product is unavailable due to moderation");

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

function enrichBids(bids, nameMap = new Map()) {
  if (!Array.isArray(bids)) return [];
  return bids.map((b) => {
    const name = maskBidderDisplayName(nameMap.get(b.bidderId), b.bidderId);
    return {
      ...b,
      bidderName: name,
    };
  });
}

async function get(auctionId) {
  const auction = await loadAuction(auctionId);
  const advanced = await maybeAdvance(auction);
  if (advanced && Array.isArray(advanced.bids) && advanced.bids.length > 0) {
    const bidderIds = advanced.bids.map((b) => b.bidderId);
    const names = await getBidderNames(bidderIds);
    advanced.bids = enrichBids(advanced.bids, names);
  }
  return advanced;
}

async function getBids(auctionId) {
  const auction = await loadAuction(auctionId);
  const bids = auction?.bids || [];
  if (bids.length === 0) return [];
  const bidderIds = bids.map((b) => b.bidderId);
  const names = await getBidderNames(bidderIds);
  return enrichBids(bids, names);
}

async function list({ status, statuses = [], skip, take, roundId, roundIds = [], search }) {
  const effectiveStatuses = [...new Set(statuses.length ? statuses : status ? [status] : [])];
  const effectiveRoundIds = [...new Set(roundIds.length ? roundIds : roundId ? [roundId] : [])];

  if (
    effectiveStatuses.length > MAX_AUCTION_FILTER_VALUES ||
    effectiveRoundIds.length > MAX_AUCTION_FILTER_VALUES
  ) {
    throw badRequest("เลือกตัวกรองได้ไม่เกิน 100 รายการต่อประเภท");
  }
  if (effectiveStatuses.some((value) => !AUCTION_STATUSES.has(value))) {
    throw badRequest("สถานะรายการประมูลไม่ถูกต้อง");
  }

  const cleanSearch = typeof search === "string" ? search.trim() : "";
  if (cleanSearch.length > MAX_AUCTION_SEARCH_LENGTH) {
    throw badRequest("คำค้นหาต้องมีความยาวไม่เกิน 100 ตัวอักษร");
  }

  let sellerIds = [];
  if (cleanSearch) {
    const matchedUsers = await searchUsers(cleanSearch);
    sellerIds = matchedUsers
      .map((user) => user?.userId || user?.id)
      .filter((id) => typeof id === "string" && id);
  }

  const result = await auctionRepository.list({
    statuses: effectiveStatuses,
    roundIds: effectiveRoundIds,
    search: cleanSearch,
    sellerIds,
    skip,
    take,
  });

  const sellerNames = new Map(
    (await getDisplayNames(result.items.map((item) => item.sellerId)))
      .filter((seller) => seller?.userId && seller?.displayName)
      .map((seller) => [seller.userId, seller.displayName]),
  );

  const items = result.items.map((item) => ({
    ...item,
    sellerDisplayName: sellerNames.get(item.sellerId) || null,
  }));
  const bidderIds = items.flatMap((item) =>
    Array.isArray(item?.bids) ? item.bids.map((b) => b.bidderId).filter(Boolean) : [],
  );
  if (bidderIds.length > 0) {
    const names = await getBidderNames(bidderIds);
    for (const item of items) {
      if (Array.isArray(item?.bids)) item.bids = enrichBids(item.bids, names);
    }
  }
  return { ...result, items };
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
  if (bidAmount > MAX_BID_AMOUNT) {
    throw badRequest(
      `ราคาเสนอประมูลต่อครั้งต้องไม่เกิน ${MAX_BID_AMOUNT.toLocaleString("th-TH")} บาท`,
    );
  }

  let targetAuction = null;
  let extendedUntil = null;
  const createdBid = await auctionRepository.withAuctionLock(auctionId, async (tx) => {
    const auction = await hydrateItem(tx, await tx.auctionItem.findUnique({
      where: { id: auctionId },
      include: {
        round: true,
        product: { select: { id: true, title: true, status: true, moderatedAt: true } },
        bids: { select: { bidderId: true } },
      },
    }));
    if (!auction) throw notFound("ไม่พบข้อมูลรายการประมูลที่ระบุ");
    targetAuction = auction;
    if(auction.product?.moderatedAt || auction.product?.status === "removed")throw conflict("auction product is unavailable due to moderation");
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

    const latestBid = await auctionRepository.latestBidByBidder(
      auctionId,
      user.id,
      tx,
    );
    if (latestBid?.createdAt) {
      const retryAfterMs =
        BID_COOLDOWN_MS -
        (now.getTime() - new Date(latestBid.createdAt).getTime());
      if (retryAfterMs > 0) {
        const error = new AppError(
          429,
          `กรุณารออีก ${Math.ceil(retryAfterMs / 1000)} วินาทีก่อนเสนอราคาครั้งถัดไป`,
        );
        error.code = "AUCTION_BID_COOLDOWN";
        throw error;
      }
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
          data: {
            scheduledEndAt: newScheduledEndAt,
            softCloseEndsAt: newScheduledEndAt,
          },
        });
        await auctionCloseQueue.scheduleClose(auctionId, newScheduledEndAt);
        extendedUntil = newScheduledEndAt;
      }
    }

    return createdBid;
  });

  if (createdBid && targetAuction && typeof chatClient?.notifyBidPlaced === "function") {
    chatClient
      .notifyBidPlaced({
        auction: targetAuction,
        bid: createdBid,
        bidder: user,
      })
      .catch((err) => {
        console.warn("[auctionService] Failed to notify seller about bid:", err.message);
      });
  }
  if (
    createdBid &&
    targetAuction &&
    extendedUntil &&
    typeof chatClient?.notifyAuctionExtended === "function"
  ) {
    chatClient
      .notifyAuctionExtended({
        auction: targetAuction,
        extendedUntil,
        bidderIds: [
          ...(targetAuction.bids || []).map((bid) => bid.bidderId),
          createdBid.bidderId,
        ],
      })
      .catch((err) => {
        console.warn("[auctionService] Failed to notify auction extension:", err.message);
      });
  }

  // Publish only after the transaction commits, so every listening page can
  // immediately reload a consistent highest bid and soft-close deadline.
  auctionRealtime.publish(auctionId, "bid.created");
  return createdBid;
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
    const round = await hydrateRound(tx, await tx.auctionRound.findUnique({
      where: { id: roundId },
      include: {
        auctions: { include: { product: true, bids: true } },
      },
    }));

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

    const cancelledRoundRecord = await writeRound(tx, "update", {
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
        data: { status: "cancelled" },
      });
      for (const id of activeIds) {
        await saveFields(tx, "AUCTION_ITEM", id, {
          cancellationReason: trimmedReason, cancelledAt: now, cancelledBy: user.id,
        });
      }

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

// Existing Redis schedules predate opening jobs. Rebook on startup so those
// auctions also open without a page visit; stable job IDs replace pending jobs.
async function restoreScheduledJobs() {
  const take = 100;
  const scheduled = [];
  // Read the pages before enqueueing due openings, which remove rows from this list.
  for (let skip = 0; ; skip += take) {
    const { items } = await auctionRepository.list({ status: "scheduled", skip, take });
    scheduled.push(...items);
    if (items.length < take) break;
  }
  for (const item of scheduled) {
    if (item.product?.moderatedAt || item.product?.status === "removed" || item.round?.cancelledAt) continue;
    await auctionCloseQueue.scheduleClose(item.id, item.scheduledEndAt, item.scheduledStartAt);
  }
}

module.exports = {
  restoreScheduledJobs,
  canTransition,
  submit,
  approve,
  reject,
  schedule,
  cancel,
  get,
  getBids,
  list,
  placeBid,
  maybeAdvance,
  closeAuction,
  advanceWinnerAfterPaymentTimeout,
  createRound,
  getCurrentRound,
  browseRounds,
  getRound,
  listRoundItems,
  listRounds,
  deriveRoundPhase,
  maskBidderDisplayName,
  cancelRound,
  isCategoryAllowedInRound,
};
