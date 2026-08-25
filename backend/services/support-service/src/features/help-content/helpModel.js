const prisma = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");

/** Trigram search over published articles only — same pattern as
 * product-service's searchProducts() (MOCK-TRADE-011): ILIKE substring OR
 * word_similarity, both index-accelerated by the search_text GIN index. */
async function search({ q, category, skip = 0, take = 20 }) {
  const categoryFilter = category
    ? Prisma.sql`AND category = ${category}`
    : Prisma.empty;
  const matchCondition = q
    ? Prisma.sql`AND (search_text ILIKE '%' || ${q} || '%' OR ${q} <% search_text)`
    : Prisma.empty;
  const rankExpr = q
    ? Prisma.sql`GREATEST(word_similarity(${q}, search_text), similarity(${q}, search_text))`
    : Prisma.sql`0`;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT id, ${rankExpr} AS rank
      FROM help_articles
      WHERE status = 'PUBLISHED' ${categoryFilter} ${matchCondition}
      ORDER BY rank DESC, updated_at DESC
      LIMIT ${take} OFFSET ${skip}
    `,
    prisma.$queryRaw`
      SELECT count(*)::int AS count
      FROM help_articles
      WHERE status = 'PUBLISHED' ${categoryFilter} ${matchCondition}
    `,
  ]);

  const total = countRows[0]?.count ?? 0;
  if (rows.length === 0) return { items: [], total };

  const ids = rows.map((r) => r.id);
  const articles = await prisma.helpArticle.findMany({
    where: { id: { in: ids } },
  });
  const byId = new Map(articles.map((a) => [a.id, a]));
  const items = ids.map((id) => byId.get(id)).filter(Boolean);
  return { items, total };
}

/** Agent-facing listing — unlike search(), includes DRAFT/ARCHIVED articles
 * and doesn't require a search term. Plain Prisma query (no trigram needed:
 * this is a management list, not a search box). */
async function listAll({ status, skip = 0, take = 20 }) {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.helpArticle.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    prisma.helpArticle.count({ where }),
  ]);
  return { items, total };
}

function findBySlug(slug) {
  return prisma.helpArticle.findUnique({ where: { slug } });
}

function findById(id) {
  return prisma.helpArticle.findUnique({ where: { id } });
}

function create(data) {
  return prisma.helpArticle.create({ data });
}

async function publish(id) {
  try {
    return await prisma.helpArticle.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        version: { increment: 1 },
      },
    });
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
}

module.exports = { search, listAll, findBySlug, findById, create, publish };
