const prisma = require("./prismaClient");
const { Prisma } = require("../generated/prisma-client");

/**
 * Trigram search over published articles — identical pattern to
 * product-service's searchProducts() (MOCK-TRADE-011):
 * ILIKE substring OR word_similarity, index-accelerated by the search_text GIN index.
 */
async function searchPublished({ q, category, skip = 0, take = 12 }) {
  const categoryFilter = category
    ? Prisma.sql`AND category = ${category}`
    : Prisma.empty;

  if (q && q.trim()) {
    const trimmed = q.trim();
    const matchCondition = Prisma.sql`(search_text ILIKE '%' || ${trimmed} || '%' OR ${trimmed} <% search_text)`;
    const rankExpr = Prisma.sql`GREATEST(word_similarity(${trimmed}, search_text), similarity(${trimmed}, search_text))`;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, ${rankExpr} AS rank
        FROM articles
        WHERE status = 'published' ${categoryFilter} AND ${matchCondition}
        ORDER BY rank DESC, published_at DESC, created_at DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      prisma.$queryRaw`
        SELECT count(*)::int AS count
        FROM articles
        WHERE status = 'published' ${categoryFilter} AND ${matchCondition}
      `,
    ]);

    const total = countRows[0]?.count ?? 0;
    if (rows.length === 0) return { items: [], total };

    const ids = rows.map((r) => r.id);
    const articles = await prisma.article.findMany({
      where: { id: { in: ids } },
    });
    const byId = new Map(articles.map((a) => [a.id, a]));
    // Preserve rank order from $queryRaw
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    return { items, total };
  }

  // Non-search query: plain Prisma query
  const where = {
    status: "published",
    ...(category ? { category } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.article.count({ where }),
  ]);

  return { items, total };
}

async function getById(id, { allowDraft = false } = {}) {
  const article = await prisma.article.findUnique({
    where: { id },
  });
  if (!article) return null;
  if (!allowDraft && article.status !== "published") return null;
  return article;
}

async function listAllForMarketing({ status, category, q, skip = 0, take = 20 }) {
  const statusFilter = status ? { status } : {};
  const categoryFilter = category ? { category } : {};

  if (q && q.trim()) {
    const trimmed = q.trim();
    const statusSql = status
      ? Prisma.sql`AND status = ${status}::"ArticleStatus"`
      : Prisma.empty;
    const catSql = category
      ? Prisma.sql`AND category = ${category}`
      : Prisma.empty;
    const matchCondition = Prisma.sql`(search_text ILIKE '%' || ${trimmed} || '%' OR ${trimmed} <% search_text)`;
    const rankExpr = Prisma.sql`GREATEST(word_similarity(${trimmed}, search_text), similarity(${trimmed}, search_text))`;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, ${rankExpr} AS rank
        FROM articles
        WHERE 1=1 ${statusSql} ${catSql} AND ${matchCondition}
        ORDER BY rank DESC, created_at DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      prisma.$queryRaw`
        SELECT count(*)::int AS count
        FROM articles
        WHERE 1=1 ${statusSql} ${catSql} AND ${matchCondition}
      `,
    ]);

    const total = countRows[0]?.count ?? 0;
    if (rows.length === 0) return { items: [], total };

    const ids = rows.map((r) => r.id);
    const articles = await prisma.article.findMany({
      where: { id: { in: ids } },
    });
    const byId = new Map(articles.map((a) => [a.id, a]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    return { items, total };
  }

  const where = {
    ...statusFilter,
    ...categoryFilter,
  };

  const [items, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.article.count({ where }),
  ]);

  return { items, total };
}

async function create({
  title,
  slug,
  summary,
  content,
  coverImage,
  category = "general",
  status = "draft",
  authorId,
  authorName,
}) {
  const isPublished = status === "published";
  const searchText = `${title} ${summary || ""} ${content} ${category} ${authorName || ""}`.trim();

  return prisma.article.create({
    data: {
      title,
      slug: slug || undefined,
      summary: summary || null,
      content,
      coverImage: coverImage || null,
      category,
      status,
      authorId,
      authorName: authorName || "ทีมการตลาด RE-LOOP",
      searchText,
      publishedAt: isPublished ? new Date() : null,
    },
  });
}

async function update(id, data) {
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) return null;

  const updateData = { ...data };
  if (data.status === "published" && !existing.publishedAt) {
    updateData.publishedAt = new Date();
  }

  // Update searchText
  const title = data.title ?? existing.title;
  const summary = data.summary ?? existing.summary ?? "";
  const content = data.content ?? existing.content;
  const category = data.category ?? existing.category;
  const authorName = data.authorName ?? existing.authorName ?? "";
  updateData.searchText = `${title} ${summary} ${content} ${category} ${authorName}`.trim();

  return prisma.article.update({
    where: { id },
    data: updateData,
  });
}

async function remove(id) {
  return prisma.article.delete({
    where: { id },
  });
}

module.exports = {
  searchPublished,
  getById,
  listAllForMarketing,
  create,
  update,
  remove,
};
