const prisma = require("./prismaClient");
const { Prisma } = require("../generated/prisma-client");
const { buildCatalogWhere } = require("../features/catalog/catalogQuery");

const WITH_MEDIA = { photos: true, videos: true };

/** Merges the photos/videos relations back into the { url, type } media array
 * shape the API/frontend expects, ordered by `position` (index 0 = cover). */
function toApiShape(product) {
  if (!product) return product;
  const { photos, videos, ...rest } = product;
  // searchText is an internal trigger-maintained field (see schema.prisma);
  // it just duplicates title/description/tags/etc. concatenated, so it's
  // dropped here rather than leaking through every product API response.
  delete rest.searchText;
  // Reservation columns are internal cart-hold bookkeeping, not part of the
  // public product shape either.
  delete rest.reservationId;
  delete rest.reservedBy;
  delete rest.reservationExpiresAt;
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
  const where = buildCatalogWhere(filters, { PrismaClient: Prisma });
  const order = q
    ? Prisma.sql`GREATEST(word_similarity(${q}, search_text), similarity(${q}, search_text)) DESC, created_at DESC`
    : Prisma.sql`created_at DESC`;
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw`SELECT id FROM products WHERE ${where} ORDER BY ${order} LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw`SELECT count(*)::int AS count FROM products WHERE ${where}`,
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
  skip,
  take,
} = {}) {
  // Public catalog always uses the same PostgreSQL query builder, including when q is absent.
  if (
    status === "available" ||
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
      skip,
      take,
    });
  }

  const where = {
    ...(status ? { status } : { status: { not: "removed" } }),
    ...(category ? { category } : {}),
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

async function listBySeller(sellerId, { status, skip, take } = {}) {
  const where = { sellerId, ...(status ? { status } : {}) };
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

async function findById(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: WITH_MEDIA,
  });
  return toApiShape(product);
}

async function create(data) {
  const { media, ...fields } = data;
  const product = await prisma.product.create({
    data: { ...fields, ...mediaToNestedCreate(media) },
    include: WITH_MEDIA,
  });
  return toApiShape(product);
}

async function update(id, patch) {
  const { media, ...fields } = patch;
  try {
    const product = await prisma.$transaction(async (tx) => {
      if (media !== undefined) {
        await tx.photo.deleteMany({ where: { productId: id } });
        await tx.video.deleteMany({ where: { productId: id } });
      }
      return tx.product.update({
        where: { id },
        data: {
          ...fields,
          ...(media !== undefined ? mediaToNestedCreate(media) : {}),
        },
        include: WITH_MEDIA,
      });
    });
    return toApiShape(product);
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
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
  const [brands, styles, sizes] = await Promise.all([
    prisma.product.findMany({
      where: { status: "available", brand: { not: "" } },
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    prisma.$queryRaw`SELECT DISTINCT unnest(tags) AS value FROM products WHERE status = 'available' ORDER BY value`,
    prisma.product.findMany({
      where: { status: "available" },
      distinct: ["size"],
      select: { size: true },
      orderBy: { size: "asc" },
    }),
  ]);
  return {
    brands: brands.map((x) => x.brand),
    styles: styles.map((x) => x.value),
    sizes: sizes.map((x) => x.size),
  };
}

module.exports = {
  list,
  listBySeller,
  findById,
  create,
  update,
  remove,
  listCategories,
  ensureCategory,
  listConditions,
  listFilterOptions,
};
