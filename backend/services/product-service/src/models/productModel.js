const prisma = require("./prismaClient");
const { Prisma } = require("../generated/prisma-client");
const { buildCatalogWhere } = require("../features/catalog/catalogQuery");
const shopSearchClient = require("../services/shopSearchClient");

const WITH_MEDIA = {
  _count: { select: { favorites: true } },
  photos: true,
  videos: true,
  categoryLinks: { include: { category: true } },
  countViews: { select: { count: true } },
  auctions: {
    where: {
      status: {
        in: ["open", "scheduled", "approved", "pending_approval", "closed"],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, status: true, startingPrice: true },
  },
};

// The seller's inventory needs the latest bid, while a closed auction needs
// its assigned winner (which can differ from the historical highest bid).
const WITH_SELLER_MEDIA = {
  ...WITH_MEDIA,
  auctions: {
    ...WITH_MEDIA.auctions,
    select: {
      ...WITH_MEDIA.auctions.select,
      winningBidId: true,
      bids: {
        orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
        take: 1,
        select: { amount: true },
      },
    },
  },
};

/** Row lock so concurrent category rewrites of one product cannot both
 * delete and re-insert the same (product_id, category_id) pair. */
async function lockProduct(client, id) {
  await client.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
}

/** Explicit `categories` replace the whole membership set. A legacy
 * `category`-only edit swaps the old primary for the new one and keeps the
 * other memberships. Read the current state before the primary column changes. */
async function categoryNames(client, id, fields, categories) {
  if (fields.category === undefined && categories === undefined) return null;
  if (categories !== undefined || !id) {
    return [
      ...new Set(
        [fields.category, ...(categories || [])].filter((v) => v !== undefined),
      ),
    ];
  }
  const current = await client.product.findUnique({
    where: { id },
    select: {
      category: true,
      categoryLinks: { select: { category: { select: { name: true } } } },
    },
  });
  const kept = (current?.categoryLinks || [])
    .map((link) => link.category.name)
    .filter((name) => name !== current.category);
  return [...new Set([...kept, fields.category])];
}

async function categoryData(client, names) {
  if (!names) return {};
  const links = [];
  for (const name of names) {
    const category = await client.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    links.push({ categoryId: category.id });
  }
  return { categoryLinks: { create: links } };
}

/** Merges the photos/videos relations back into the { url, type } media array
 * shape the API/frontend expects, ordered by `position` (index 0 = cover). */
function toApiShape(product) {
  if (!product) return product;
  const { photos, videos, categoryLinks, countViews, ...rest } = product;
  rest.favoriteCount = product._count?.favorites || 0;
  delete rest._count;
  if (categoryLinks) rest.categories = categoryLinks.map((link) => link.category.name).sort();
  const viewCount = Array.isArray(countViews)
    ? countViews.reduce((acc, cv) => acc + (cv.count || 0), 0)
    : product.viewCount || 0;
  rest.viewCount = viewCount;
  const moderationActive = Boolean(
    rest.moderatedAt || rest.status === "removed",
  );
  if (moderationActive) {
    rest.commerceStatus =
      rest.status === "removed"
        ? rest.preRemovalStatus || "available"
        : rest.status;
    rest.status = "removed";
  }
  // searchText is an internal trigger-maintained field (see schema.prisma);
  // it just duplicates title/description/tags/etc. concatenated, so it's
  // dropped here rather than leaking through every product API response.
  delete rest.searchText;
  // Reservation columns are internal cart-hold bookkeeping, not part of the
  // public product shape either.
  delete rest.reservationId;
  delete rest.reservedBy;
  delete rest.reservationExpiresAt;
  if (Array.isArray(product.auctions) && product.auctions[0]) {
    rest.auctionId = product.auctions[0].id;
    rest.auctionStatus = product.auctions[0].status;
  }
  delete rest.auctions;
  const media = [
    ...(photos || []).map((p) => ({ ...p, type: "image" })),
    ...(videos || []).map((v) => ({ ...v, type: "video" })),
  ]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ url: m.url, type: m.type }));
  // `styleTags` is the catalog contract name; `tags` remains for seller/edit compatibility.
  return { ...rest, styleTags: rest.tags || [], media };
}

/** Splits the incoming { url, type }[] media array into nested Prisma
 * create payloads for the photos/videos tables, preserving submitted order. */
function mediaToNestedCreate(media) {
  const photos = [];
  const videos = [];
  (media || []).forEach((m, position) => {
    if (m.type === "video") videos.push({ url: m.url, position });
    else photos.push({ url: m.url, position });
  });
  return {
    ...(photos.length ? { photos: { create: photos } } : {}),
    ...(videos.length ? { videos: { create: videos } } : {}),
  };
}

/** Full-text-ish search against Product.searchText (a trigger-maintained
 * concat of title/description/category/brand/condition/location/size/tags — see
 * prisma/schema.prisma and prisma/seed.js's ensureSearchTextTrigger).
 *
 * Postgres full-text search (tsvector/to_tsquery) can't be used here: it has
 * no Thai text-search config, and its "simple" config tokenizes on
 * whitespace, which Thai doesn't reliably use between words — querying
 * "เสื้อ" against a stored "เสื้อยืดวินเทจ" token literally does not match.
 * pg_trgm's trigram matching works on 3-character sequences regardless of
 * script, so it degrades gracefully for Thai instead of just failing.
 *
 * Matches on either: a literal substring (ILIKE, catches short/exact
 * queries trigram similarity would score too low) OR a word-similarity hit
 * (the `<%` operator, catches fuzzy/typo'd/multi-word matches). Both sides
 * use the same GIN gin_trgm_ops index on search_text (verified with
 * EXPLAIN — see docs/progress.md MOCK-TRADE-011 evidence table).
 */
async function searchProducts(filters) {
  const { skip = 0, take = 20, q } = filters;
  let matchingSellerIds = [];
  if (q) {
    try {
      matchingSellerIds = await shopSearchClient.findSellerIds(q);
    } catch (err) {
      // Keep product keyword search available during an auth-service outage.
      console.warn("[shopSearch] Shop lookup failed:", err.message);
    }
  }
  const where = buildCatalogWhere(
    { ...filters, matchingSellerIds },
    { PrismaClient: Prisma },
  );
  const order = q
    ? Prisma.sql`
        ts_rank_cd(search_vector, plainto_tsquery('simple', ${q})) DESC,
        GREATEST(word_similarity(${q}, search_text), similarity(${q}, search_text)) DESC,
        created_at DESC, id ASC
      `
    : Prisma.sql`created_at DESC, id ASC`;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT id FROM products
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${take} OFFSET ${skip}
    `,
    prisma.$queryRaw`
      SELECT count(*)::int AS count
      FROM products
      WHERE ${where}
    `,
  ]);

  const total = countRows[0]?.count ?? 0;
  if (rows.length === 0) return { items: [], total };

  // Raw query already picked the ranked page of ids; re-hydrate full rows
  // (with media) through Prisma and restore that same rank order, since
  // `id IN (...)` makes no ordering guarantee of its own.
  const ids = rows.map((r) => r.id);
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: WITH_MEDIA,
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(toApiShape);
  return { items, total };
}

async function list({
  category,
  q,
  brand,
  style,
  size,
  condition,
  minPrice,
  maxPrice,
  status,
  includeModerated = false,
  moderatedOnly = false,
  skip,
  take,
} = {}) {
  // Public catalog always uses the same PostgreSQL query builder, including when q is absent.
  if (
    status === "available" ||
    moderatedOnly ||
    includeModerated ||
    q ||
    brand ||
    style ||
    size ||
    condition ||
    minPrice !== undefined ||
    maxPrice !== undefined
  ) {
    return searchProducts({
      q,
      category,
      brand,
      style,
      size,
      condition,
      minPrice,
      maxPrice,
      status,
      includeModerated,
      moderatedOnly,
      skip,
      take,
    });
  }

  const where = {
    ...(moderatedOnly
      ? { OR: [{ moderatedAt: { not: null } }, { status: "removed" }] }
      : status
        ? { status, moderatedAt: null }
        : includeModerated
          ? {}
          : {
              status: {
                notIn: ["removed", "hidden", "auction_action_required"],
              },
              moderatedAt: null,
            }),
    ...(category
      ? { categoryLinks: { some: { category: { name: category } } } }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: WITH_MEDIA,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);
  return { items: items.map(toApiShape), total };
}

async function listBySeller(
  sellerId,
  { status, includeModerated = false, skip, take } = {},
) {
  let statusFilter = {};
  if (Array.isArray(status)) {
    statusFilter = { status: { in: status } };
  } else if (status) {
    statusFilter = { status };
  }
  const where = { sellerId, ...statusFilter };
  if (!includeModerated) {
    where.moderatedAt = null;
    if (!status) where.status = { not: "removed" };
  }
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: WITH_SELLER_MEDIA,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);
  const winnerIds = items
    .map((product) => product.auctions?.[0]?.winningBidId)
    .filter(Boolean);
  const winningBids = winnerIds.length
    ? await prisma.bid.findMany({
        where: { id: { in: winnerIds } },
        select: { id: true, amount: true },
      })
    : [];
  const winningAmounts = new Map(
    winningBids.map((bid) => [bid.id, bid.amount]),
  );
  return {
    items: items.map((product) => {
      const shaped = toApiShape(product);
      const auction = product.auctions?.[0];
      if (!auction) return shaped;
      return {
        ...shaped,
        auctionStartingPrice: auction.startingPrice,
        auctionCurrentBid: auction.bids?.[0]?.amount ?? null,
        auctionWinningPrice: winningAmounts.get(auction.winningBidId) ?? null,
      };
    }),
    total,
  };
}

async function findById(id, tx = prisma) {
  const client = tx?.product ? tx : prisma;
  const product = await client.product.findUnique({
    where: { id },
    include: WITH_MEDIA,
  });
  return toApiShape(product);
}

async function create(data, tx = prisma) {
  const client = tx || prisma;
  const { media, categories, ...fields } = data;
  const run = async (db) =>
    db.product.create({
      data: {
        ...fields,
        ...(await categoryData(
          db,
          await categoryNames(db, null, fields, categories),
        )),
        ...mediaToNestedCreate(media),
      },
      include: WITH_MEDIA,
    });
  const product =
    client === prisma ? await prisma.$transaction(run) : await run(client);
  return toApiShape(product);
}

async function update(id, patch, tx = null) {
  const { media, categories, ...fields } = patch;
  try {
    const run = async (client) => {
      if (media !== undefined) {
        await client.photo.deleteMany({ where: { productId: id } });
        await client.video.deleteMany({ where: { productId: id } });
      }
      const changesCategories =
        fields.category !== undefined || categories !== undefined;
      if (changesCategories) await lockProduct(client, id);
      const links = await categoryData(
        client,
        await categoryNames(client, id, fields, categories),
      );
      if (links.categoryLinks)
        await client.productCategory.deleteMany({ where: { productId: id } });
      return client.product.update({
        where: { id },
        data: {
          ...fields,
          ...links,
          ...(media !== undefined ? mediaToNestedCreate(media) : {}),
        },
        include: WITH_MEDIA,
      });
    };
    const product = tx?.product
      ? await run(tx)
      : await prisma.$transaction(run);
    return toApiShape(product);
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
}

async function updateBySeller(id, patch) {
  const { media, categories, ...fields } = patch;
  return prisma.$transaction(async (tx) => {
    // Lock and read memberships before updateMany overwrites the primary column.
    const changesCategories =
      fields.category !== undefined || categories !== undefined;
    if (changesCategories) await lockProduct(tx, id);
    const names = await categoryNames(tx, id, fields, categories);
    const claimed = await tx.product.updateMany({
      where: {
        id,
        moderatedAt: null,
        status: { notIn: ["removed", "reserved", "auction", "sold"] },
        OR: [
          { status: { not: "hidden" } },
          { preRemovalStatus: null },
          { preRemovalStatus: { notIn: ["reserved", "sold"] } },
        ],
      },
      data: { ...fields, updatedAt: new Date() },
    });
    if (claimed.count !== 1) return null;

    const links = await categoryData(tx, names);
    if (links.categoryLinks) {
      await tx.productCategory.deleteMany({ where: { productId: id } });
      await tx.product.update({ where: { id }, data: links });
    }
    if (media !== undefined) {
      await tx.photo.deleteMany({ where: { productId: id } });
      await tx.video.deleteMany({ where: { productId: id } });
      await tx.product.update({
        where: { id },
        data: mediaToNestedCreate(media),
      });
    }

    return toApiShape(
      await tx.product.findUnique({ where: { id }, include: WITH_MEDIA }),
    );
  });
}

async function remove(id) {
  try {
    await prisma.product.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === "P2025") return false;
    throw err;
  }
}

async function removeBySeller(id, sellerId) {
  const removed = await prisma.product.deleteMany({
    where: {
      id,
      sellerId,
      moderatedAt: null,
      status: { notIn: ["removed", "reserved", "auction", "sold"] },
      OR: [
        { status: { not: "hidden" } },
        { preRemovalStatus: null },
        { preRemovalStatus: { notIn: ["reserved", "sold"] } },
      ],
    },
  });
  return removed.count === 1;
}

/**
 * Toggles a product between "available"/"reserved" and "hidden".
 * - Hiding saves the current status in preRemovalStatus so we can restore it.
 * - Unhiding restores the saved status (default: "available").
 * If the product is "reserved" and gets hidden, it stays in preRemovalStatus
 * so buyers see it gone from their cart until it is un-hidden.
 */
async function setVisibility(id, visible) {
  if (visible) {
    // Restore to whatever status it had before hiding (default: available).
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return null;
    if (
      product.moderatedAt || product.status === "removed" ||
      product.status === "sold" || product.preRemovalStatus === "sold"
    ) {
      return toApiShape(
        await prisma.product.findUnique({ where: { id }, include: WITH_MEDIA }),
      );
    }
    const restored = product.preRemovalStatus || "available";
    await prisma.product.updateMany({
      where: { id, status: product.status, preRemovalStatus: product.preRemovalStatus || null, moderatedAt: null },
      data: { status: restored, preRemovalStatus: null },
    });
    return toApiShape(
      await prisma.product.findUnique({ where: { id }, include: WITH_MEDIA }),
    );
  } else {
    // Only hide if currently browsable (available or reserved).
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return null;
    if (
      product.moderatedAt ||
      product.status === "hidden" ||
      product.status === "removed" ||
      product.status === "sold" ||
      product.preRemovalStatus === "sold"
    ) {
      return toApiShape(
        await prisma.product.findUnique({ where: { id }, include: WITH_MEDIA }),
      );
    }
    await prisma.product.updateMany({
      where: { id, status: product.status, preRemovalStatus: product.preRemovalStatus || null, moderatedAt: null },
      data: { status: "hidden", preRemovalStatus: product.status },
    });
    return toApiShape(
      await prisma.product.findUnique({ where: { id }, include: WITH_MEDIA }),
    );
  }
}

function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

/** Inserts the category if it's not already known — this is how free-text
 * category entry from the seller still ends up as real, queryable data. */
async function ensureCategory(name) {
  await prisma.category.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

function listConditions() {
  return prisma.condition.findMany({ orderBy: { sortOrder: "asc" } });
}

async function listFilterOptions() {
  const { groupSizesByCategory } = require("../features/catalog/sizeOptions");
  try {
    const [brands, styles, sizes, sizedProducts] = await Promise.all([
      prisma.product.findMany({
        where: {
          status: "available",
          moderatedAt: null,
          brand: { not: "" },
        },
        distinct: ["brand"],
        select: { brand: true },
        orderBy: { brand: "asc" },
      }),
      prisma.$queryRaw`SELECT DISTINCT unnest(tags) AS value FROM products WHERE status = 'available' AND moderated_at IS NULL ORDER BY value`,
      prisma.product.findMany({
        where: { status: "available", moderatedAt: null },
        distinct: ["size"],
        select: { size: true },
        orderBy: { size: "asc" },
      }),
      prisma.product.findMany({
        where: { status: "available", moderatedAt: null, size: { not: "" } },
        select: {
          size: true,
          category: true,
          categoryLinks: { select: { category: { select: { name: true } } } },
        },
      }),
    ]);
    return {
      brands: brands.map((x) => x.brand).filter(Boolean),
      styles: styles.map((x) => x.value).filter(Boolean),
      sizes: sizes.map((x) => x.size).filter(Boolean),
      sizesByCategory: groupSizesByCategory(sizedProducts),
    };
  } catch (err) {
    console.warn("listFilterOptions fallback:", err.message);
    return { brands: [], styles: [], sizes: [], sizesByCategory: [] };
  }
}

/**
 * Records a view for a product in count_views table.
 * Rules:
 * - Count only when the product is available and has not been purchased / reserved by a buyer.
 * - Do NOT count if the product is sold or reserved (status !== "available").
 * - Do NOT count if the product has a buyer (reservedBy is set).
 * - Do NOT count the seller of the product (viewerId === product.sellerId).
 * - Do NOT count the buyer of the product (viewerId === product.reservedBy or viewer is order.buyerId).
 * - Do NOT count if there is an active order in order-service.
 * Returns true if a view was counted/incremented, false otherwise.
 */
async function recordView(productId, viewerId, { tx = null } = {}) {
  if (!productId || !viewerId) return false;
  const client = tx || prisma;

  const product = await client.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, status: true, reservedBy: true },
  });

  if (!product) return false;

  // 1. Only count if product has not been purchased yet (not sold)
  if (product.status === "sold") {
    return false;
  }

  // 2. Do NOT count the seller of that product (count only buyers / visitors)
  if (product.sellerId === viewerId) {
    return false;
  }

  await client.countView.upsert({
    where: {
      viewerId_productId: {
        viewerId,
        productId,
      },
    },
    update: {
      count: { increment: 1 },
    },
    create: {
      viewerId,
      productId,
      count: 1,
    },
  });

  return true;
}

async function getViewCount(productId, { tx = null } = {}) {
  const client = tx || prisma;
  const sumResult = await client.countView.aggregate({
    where: { productId },
    _sum: { count: true },
  });
  return sumResult._sum.count || 0;
}

module.exports = {
  toApiShape,
  list,
  listBySeller,
  findById,
  create,
  update,
  updateBySeller,
  remove,
  removeBySeller,
  setVisibility,
  listCategories,
  ensureCategory,
  listConditions,
  listFilterOptions,
  recordView,
  getViewCount,
};
