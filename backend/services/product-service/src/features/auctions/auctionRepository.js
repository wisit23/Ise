const prisma = require("../../models/prismaClient");

/**
 * Database access for the Auction feature.
 *
 * route -> controller -> service -> repository -> PostgreSQL, same layering
 * as the ProductVideo feature.
 */
function createAuctionRepository(prismaClient) {
  // Ordered by position so the seller's chosen cover photo (index 0) is
  // always photos[0] — same convention productModel uses for listings.
  const WITH_PRODUCT = {
    product: { include: { photos: { orderBy: { position: "asc" } } } },
    round: true,
  };

  function findProductOwner(productId, tx = prismaClient) {
    const client = tx || prismaClient;
    return client.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true, status: true, category: true },
    });
  }

  function create(data, tx = prismaClient) {
    const client = tx || prismaClient;
    return client.auctionItem.create({ data, include: WITH_PRODUCT });
  }

  function findById(id, tx = prismaClient) {
    const client = tx || prismaClient;
    return client.auctionItem.findUnique({
      where: { id },
      include: { ...WITH_PRODUCT, bids: { orderBy: { amount: "desc" } } },
    });
  }

  async function list({ status, skip, take, roundId }) {
    const where = {
      ...(status ? { status } : {}),
      ...(roundId ? { roundId } : {}),
    };
    const [items, total] = await Promise.all([
      prismaClient.auctionItem.findMany({
        where,
        include: WITH_PRODUCT,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prismaClient.auctionItem.count({ where }),
    ]);
    return { items, total };
  }

  function updateStatus(id, data, tx = prismaClient) {
    const client = tx || prismaClient;
    return client.auctionItem.update({
      where: { id },
      data,
      include: WITH_PRODUCT,
    });
  }

  function highestBid(auctionId, tx = prismaClient) {
    return tx.bid.findFirst({
      where: { auctionId },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    });
  }

  function createBid(data, tx = prismaClient) {
    return tx.bid.create({ data });
  }

  /**
   * Serializes concurrent bids, item cancellations, and closing on the same
   * auction item using a Postgres transaction-scoped advisory lock.
   */
  function withAuctionLock(auctionId, fn) {
    return prismaClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${auctionId}))`;
      return fn(tx);
    });
  }

  /**
   * Serializes concurrent seller recovery operations (resubmit to new round vs
   * relist as normal product) on the same Product.
   */
  function withProductLock(productId, fn) {
    return prismaClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
      return fn(tx);
    });
  }

  function setProductStatus(productId, status, tx = prismaClient) {
    return tx.product.update({
      where: { id: productId },
      data: { status },
    });
  }

  function createRound(data, tx = prismaClient) {
    const client = tx || prismaClient;
    return client.auctionRound.create({ data });
  }

  function findActiveSubmissionRounds(now = new Date()) {
    return prismaClient.auctionRound.findMany({
      where: {
        cancelledAt: null,
        submissionStartsAt: { lte: now },
        submissionEndsAt: { gt: now },
      },
      orderBy: [
        { submissionEndsAt: "asc" },
        { submissionStartsAt: "asc" },
        { id: "asc" },
      ],
      include: {
        _count: { select: { auctions: true } },
      },
    });
  }

  function findActiveAuctionRounds(
    now = new Date(),
    { includeCancelled = false } = {},
  ) {
    return prismaClient.auctionRound.findMany({
      where: {
        ...(includeCancelled ? {} : { cancelledAt: null }),
        auctionStartsAt: { lte: now },
        auctionEndsAt: { gt: now },
      },
      orderBy: [
        { auctionEndsAt: "asc" },
        { auctionStartsAt: "asc" },
        { id: "asc" },
      ],
      include: {
        _count: {
          select: {
            auctions: {
              where: {
                status: {
                  in: includeCancelled
                    ? ["open", "scheduled", "cancelled"]
                    : ["open", "scheduled"],
                },
                scheduledEndAt: { gt: now },
              },
            },
          },
        },
      },
    });
  }

  function findUpcomingRounds(
    now = new Date(),
    { includeCancelled = false } = {},
  ) {
    return prismaClient.auctionRound.findMany({
      where: {
        ...(includeCancelled ? {} : { cancelledAt: null }),
        auctionStartsAt: { gt: now },
        auctionEndsAt: { gt: now },
      },
      orderBy: [
        { auctionStartsAt: "asc" },
        { submissionStartsAt: "asc" },
        { id: "asc" },
      ],
      include: {
        _count: {
          select: {
            auctions: {
              where: {
                status: {
                  in: includeCancelled
                    ? ["open", "scheduled", "cancelled"]
                    : ["open", "scheduled"],
                },
                scheduledEndAt: { gt: now },
              },
            },
          },
        },
      },
    });
  }

  function listRounds() {
    return prismaClient.auctionRound.findMany({
      orderBy: { submissionStartsAt: "desc" },
      include: {
        _count: { select: { auctions: true } },
      },
    });
  }

  function findRoundById(id, tx = prismaClient) {
    const client = tx || prismaClient;
    return client.auctionRound.findUnique({
      where: { id },
      include: {
        auctions: { include: WITH_PRODUCT },
      },
    });
  }

  function findRoundForSubmission(id, tx = prismaClient) {
    const client = tx || prismaClient;
    return client.auctionRound.findUnique({
      where: { id },
    });
  }

  function findRoundWithItems(id) {
    return prismaClient.auctionRound.findUnique({
      where: { id },
      include: {
        auctions: {
          where: {
            status: { in: ["open", "scheduled", "cancelled"] },
          },
          include: WITH_PRODUCT,
          orderBy: [{ scheduledEndAt: "asc" }, { createdAt: "desc" }],
        },
      },
    });
  }

  function findCategory(name) {
    return prismaClient.category.findUnique({ where: { name } });
  }

  function listCategories() {
    return prismaClient.category.findMany({ select: { name: true } });
  }

  function transaction(fn) {
    return prismaClient.$transaction(fn);
  }

  /**
   * Acquires the round-level transaction advisory lock using the exact same
   * lock key (`hashtext(roundId)`) as `withRoundLock(roundId)` so that any
   * round item submission (`submit`) is strictly serialized against
   * `cancelRound`.
   *
   * When `productId` is also provided (Flow A: existing product submission),
   * locks are always acquired in deterministic order:
   *   1. Round Lock (`hashtext(roundId)`)
   *   2. Product Lock (`hashtext(productId)`)
   */
  function withRoundMutationLock(roundId, fn, { productId = null } = {}) {
    return prismaClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${roundId}))`;
      if (productId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
      }
      return fn(tx);
    });
  }

  /**
   * Acquires round advisory lock AND locks every AuctionItem in the round in
   * deterministic ascending ID order using the exact same lock key as
   * withAuctionLock(auctionId) to prevent races and deadlocks with placeBid /
   * closeAuction / cancel.
   */
  function withRoundLock(roundId, fn) {
    return prismaClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${roundId}))`;
      if (typeof tx.auctionItem?.findMany === "function") {
        const items = await tx.auctionItem.findMany({
          where: { roundId },
          select: { id: true },
          orderBy: { id: "asc" },
        });
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item?.id) {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${item.id}))`;
            }
          }
        }
      }
      return fn(tx);
    });
  }

  function findActiveAuctionByProductId(productId, tx = prismaClient) {
    const client = tx || prismaClient;
    if (typeof client.auctionItem?.findFirst !== "function") {
      return null;
    }
    return client.auctionItem.findFirst({
      where: {
        productId,
        status: {
          in: ["draft", "pending_approval", "approved", "scheduled", "open"],
        },
      },
    });
  }

  return {
    transaction,
    findProductOwner,
    create,
    findById,
    list,
    updateStatus,
    highestBid,
    createBid,
    withAuctionLock,
    withProductLock,
    withRoundMutationLock,
    setProductStatus,
    createRound,
    findActiveSubmissionRounds,
    findActiveAuctionRounds,
    findUpcomingRounds,
    listRounds,
    findRoundById,
    findRoundWithItems,
    findRoundForSubmission,
    findCategory,
    listCategories,
    withRoundLock,
    findActiveAuctionByProductId,
  };
}

module.exports = createAuctionRepository(prisma);
module.exports.createAuctionRepository = createAuctionRepository;
