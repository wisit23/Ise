const prisma = require("../../models/prismaClient");
const { conflict } = require("@reloop/shared");
const { addRoundCapacityCounts } = require("./roundCapacity");
const { hydrateRound, hydrateItem, splitFields, saveFields, writeRound, writeItem } = require("./auctionAuditState");

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

  async function findProductOwner(productId, tx = prismaClient) {
    const client = tx || prismaClient;
    const product = await client.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true, status: true, category: true, moderatedAt: true,
        categoryLinks: { include: { category: true } } },
    });
    if (!product) return product;
    const { categoryLinks, ...fields } = product;
    return { ...fields, categories: categoryLinks.map((link) => link.category.name) };
  }

  function create(data, tx = prismaClient) {
    const run = (client) => writeItem(client, "create", { data, include: WITH_PRODUCT });
    return tx === prismaClient ? prismaClient.$transaction(run) : run(tx);
  }

  async function findById(id, tx = prismaClient) {
    const client = tx || prismaClient;
    return hydrateItem(client, await client.auctionItem.findUnique({
      where: { id },
      include: {
        ...WITH_PRODUCT,
        bids: { orderBy: [{ amount: "desc" }, { createdAt: "asc" }] },
      },
    }));
  }

  async function list({ status, statuses, skip, take, roundId, roundIds, search, sellerIds = [] }) {
    const effectiveStatuses = statuses?.length ? statuses : status ? [status] : [];
    const effectiveRoundIds = roundIds?.length ? roundIds : roundId ? [roundId] : [];
    const where = {
      ...(effectiveStatuses.length
        ? { status: { in: effectiveStatuses } }
        : {}),
      ...(effectiveRoundIds.length
        ? { roundId: { in: effectiveRoundIds } }
        : {}),
      ...(search
        ? {
            OR: [
              {
                product: {
                  title: { contains: search, mode: "insensitive" },
                },
              },
              ...(sellerIds.length ? [{ sellerId: { in: sellerIds } }] : []),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prismaClient.auctionItem.findMany({
        where,
        include: {
          ...WITH_PRODUCT,
          bids: { orderBy: [{ amount: "desc" }, { createdAt: "asc" }] },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prismaClient.auctionItem.count({ where }),
    ]);
    return { items: await Promise.all(items.map((item) => hydrateItem(prismaClient, item))), total };
  }

  async function updateStatus(id, data, txOrOptions = prismaClient, transactionOptions = {}) {
    // An explicitly supplied Prisma client is already inside the caller's
    // transaction, even when a test/repository wrapper passes the same object
    // that was used to construct this repository. With no third argument we
    // still open the repository-owned transaction as before.
    const tx = arguments.length >= 3 && txOrOptions?.auctionItem
      ? txOrOptions
      : null;
    const options = tx ? transactionOptions : txOrOptions || {};
    const run = async (client) => {
      if (options.expectedStatus || options.requireUnmoderatedProduct || options.startDueAt) {
        const { columns, erFields } = splitFields(data, "AUCTION_ITEM");
        const changed = await client.auctionItem.updateMany({
          where: { id, ...(options.expectedStatus ? { status: options.expectedStatus } : {}),
            ...(options.startDueAt ? { scheduledStartAt: { lte: options.startDueAt } } : {}),
            ...(options.requireUnmoderatedProduct ? { product: { moderatedAt: null, status: { not: "removed" } } } : {}) },
          data: columns,
        });
        if (changed.count) await saveFields(client, "AUCTION_ITEM", id, erFields);
        if (options.strictStatus && changed.count !== 1) {
          throw conflict("สถานะสินค้าประมูลเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่");
        }
        return findById(id, client);
      }
      return writeItem(client, "update", { where: { id }, data, include: WITH_PRODUCT });
    };
    return tx ? run(tx) : prismaClient.$transaction(run);
  }

  function highestBid(auctionId, tx = prismaClient) {
    return tx.bid.findFirst({
      where: { auctionId },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    });
  }

  function latestBidByBidder(auctionId, bidderId, tx = prismaClient) {
    if (typeof tx.bid?.findFirst !== "function") return null;
    return tx.bid.findFirst({
      where: { auctionId, bidderId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
    const run = (client) => writeRound(client, "create", { data });
    return tx === prismaClient ? prismaClient.$transaction(run) : run(tx);
  }

  async function findActiveSubmissionRounds(now = new Date()) {
    const rows = await prismaClient.auctionRound.findMany({
      where: {
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
    const rounds = await Promise.all(rows.map((r) => hydrateRound(prismaClient, r)));
    return rounds.filter((r) => !r.cancelledAt);
  }

  async function findActiveAuctionRounds(
    now = new Date(),
    { includeCancelled = false } = {},
  ) {
    const rows = await prismaClient.auctionRound.findMany({
      where: {
        auctionStartsAt: { lte: now },
        OR: [
          { auctionEndsAt: { gt: now } },
          {
            auctions: {
              some: { status: "open", scheduledEndAt: { gt: now } },
            },
          },
        ],
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
    const rounds = await Promise.all(rows.map((r) => hydrateRound(prismaClient, r)));
    return rounds.filter((r) => includeCancelled || !r.cancelledAt);
  }

  async function findUpcomingRounds(
    now = new Date(),
    { includeCancelled = false } = {},
  ) {
    const rows = await prismaClient.auctionRound.findMany({
      where: {
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
    const rounds = await Promise.all(rows.map((r) => hydrateRound(prismaClient, r)));
    return rounds.filter((r) => includeCancelled || !r.cancelledAt);
  }

  async function listRounds(options = {}) {
    const { skip, take } = options;
    const isPaginated = typeof skip === "number" && typeof take === "number";

    if (!isPaginated) {
      const rows = await prismaClient.auctionRound.findMany({
        orderBy: { submissionStartsAt: "desc" },
        include: {
          _count: {
            select: {
              auctions: {
                where: { status: { notIn: ["rejected", "cancelled"] } },
              },
            },
          },
        },
      });
      return Promise.all(rows.map((round) => hydrateRound(prismaClient, round)));
    }

    const [items, total] = await Promise.all([
      prismaClient.auctionRound.findMany({
        orderBy: { submissionStartsAt: "desc" },
        include: {
          _count: {
            select: {
              auctions: {
                where: { status: { notIn: ["rejected", "cancelled"] } },
              },
            },
          },
        },
        skip,
        take,
      }),
      prismaClient.auctionRound.count(),
    ]);

    return {
      items: await Promise.all(items.map((round) => hydrateRound(prismaClient, round))),
      total,
    };
  }

  async function findRoundById(id, tx = prismaClient) {
    const client = tx || prismaClient;
    return hydrateRound(client, await client.auctionRound.findUnique({
      where: { id },
      include: { auctions: { include: WITH_PRODUCT } },
    }));
  }

  async function findRoundForSubmission(id, tx = prismaClient) {
    const client = tx || prismaClient;
    return hydrateRound(client, await client.auctionRound.findUnique({ where: { id } }));
  }

  async function findRoundWithItems(id) {
    return hydrateRound(prismaClient, await prismaClient.auctionRound.findUnique({
      where: { id },
      include: {
        auctions: {
          where: {
            status: { in: ["open", "scheduled"] },
          },
          include: WITH_PRODUCT,
          orderBy: [{ scheduledEndAt: "asc" }, { createdAt: "desc" }],
        },
      },
    }));
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
    addCapacityCounts: rounds => addRoundCapacityCounts(rounds, prismaClient),
    transaction,
    findProductOwner,
    create,
    findById,
    list,
    updateStatus,
    highestBid,
    latestBidByBidder,
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
