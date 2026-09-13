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

  function findProductOwner(productId) {
    return prismaClient.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true, status: true },
    });
  }

  function create(data) {
    return prismaClient.auctionItem.create({ data, include: WITH_PRODUCT });
  }

  function findById(id) {
    return prismaClient.auctionItem.findUnique({
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

  function updateStatus(id, data) {
    return prismaClient.auctionItem.update({
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
   * Serializes concurrent bids on the same auction. Postgres advisory locks
   * are session/transaction scoped and cost nothing to set up (no extra
   * table), unlike `SELECT ... FOR UPDATE` which can't lock a row that
   * doesn't exist yet for an auction's first bid.
   */
  function withAuctionLock(auctionId, fn) {
    return prismaClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${auctionId}))`;
      return fn(tx);
    });
  }

  function setProductStatus(productId, status, tx = prismaClient) {
    return tx.product.update({
      where: { id: productId },
      data: { status },
    });
  }

  function createRound(data) {
    return prismaClient.auctionRound.create({ data });
  }

  function findActiveSubmissionRound(now = new Date()) {
    return prismaClient.auctionRound.findFirst({
      where: {
        submissionStartsAt: { lte: now },
        submissionEndsAt: { gte: now },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  function findCurrentRound() {
    return prismaClient.auctionRound.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { auctions: true } },
      },
    });
  }

  function listRounds() {
    return prismaClient.auctionRound.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { auctions: true } },
      },
    });
  }

  function findRoundById(id) {
    return prismaClient.auctionRound.findUnique({
      where: { id },
      include: {
        auctions: { include: WITH_PRODUCT },
      },
    });
  }

  return {
    findProductOwner,
    create,
    findById,
    list,
    updateStatus,
    highestBid,
    createBid,
    withAuctionLock,
    setProductStatus,
    createRound,
    findActiveSubmissionRound,
    findCurrentRound,
    listRounds,
    findRoundById,
  };
}

module.exports = createAuctionRepository(prisma);
module.exports.createAuctionRepository = createAuctionRepository;
