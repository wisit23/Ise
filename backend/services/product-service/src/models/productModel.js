const prisma = require("./prismaClient");
const { Prisma } = require("../generated/prisma-client");

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
  const media = [
    ...(photos || []).map((p) => ({ ...p, type: "image" })),
    ...(videos || []).map((v) => ({ ...v, type: "video" })),
  ]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ url: m.url, type: m.type }));
  return { ...rest, media };
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

/** Hybrid search against Product.searchVector and Product.searchText.
 * concat of title/description/category/condition/location/size/tags — see
 * prisma/schema.prisma and prisma/seed.js's ensureSearchTextTrigger).
 *
 * PostgreSQL FTS supplies field-aware lexical relevance for whitespace-
 * separated terms. Its `simple` config cannot word-break Thai, so pg_trgm
 * remains an equal partner: it handles Thai substrings and misspellings.
 *
 * FTS weights title/tags (A) above category (B), description (C), and other
 * metadata (D). The final score blends lexical rank with trigram similarity,
 * plus a small exact-title boost. A row may match either engine.
 */
async function searchProducts({ q, category, status, skip = 0, take = 20 }) {
  const statusFilter = status
    ? Prisma.sql`status = ${status}`
    : Prisma.sql`status <> 'removed'`;
  const categoryFilter = category
    ? Prisma.sql`AND category = ${category}`
    : Prisma.empty;
  const textQuery = Prisma.sql`websearch_to_tsquery('simple', ${q})`;
  const fullTextRank = Prisma.sql`COALESCE(ts_rank_cd(search_vector, ${textQuery}, 32), 0)`;
  const trigramRank = Prisma.sql`GREATEST(word_similarity(${q}, search_text), similarity(${q}, search_text))`;
  const exactTitleBoost = Prisma.sql`CASE WHEN title ILIKE '%' || ${q} || '%' THEN 0.15 ELSE 0 END`;
  const hybridRank = Prisma.sql`(0.65 * ${fullTextRank}) + (0.35 * ${trigramRank}) + ${exactTitleBoost}`;
  const matchCondition = Prisma.sql`(
    search_vector @@ ${textQuery}
    OR search_text ILIKE '%' || ${q} || '%'
    OR ${q} <% search_text
  )`;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT id, ${hybridRank} AS rank
      FROM products
      WHERE ${statusFilter} ${categoryFilter} AND ${matchCondition}
      ORDER BY rank DESC, created_at DESC
      LIMIT ${take} OFFSET ${skip}
    `,
    prisma.$queryRaw`
      SELECT count(*)::int AS count
      FROM products
      WHERE ${statusFilter} ${categoryFilter} AND ${matchCondition}
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
  const items = ids.map((id) => byId.get(id)).filter(Boolean).map(toApiShape);
  return { items, total };
}

async function list({ category, q, status, skip, take } = {}) {
  if (q) return searchProducts({ q, category, status, skip, take });

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
};
