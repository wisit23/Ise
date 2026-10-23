const prisma = require("./prismaClient");
const { Prisma } = require("../generated/prisma-client");

const countedViewInclude = {
  _count: {
    select: { views: { where: { countedAt: { not: null } } } },
  },
};

function withViewCount(article) {
  if (!article) return article;
  const { _count, ...data } = article;
  return { ...data, viewCount: _count?.views || 0 };
}

function withViewCounts(articles) {
  return articles.map(withViewCount);
}

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
      include: countedViewInclude,
    });
    const byId = new Map(articles.map((a) => [a.id, a]));
    // Preserve rank order from $queryRaw
    const items = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map(withViewCount);
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
      include: countedViewInclude,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.article.count({ where }),
  ]);

  return { items: withViewCounts(items), total };
}

async function listAllForMarketing({
  status,
  category,
  q,
  skip = 0,
  take = 20,
}) {
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
    let published = 0;
    let draft = 0;
    if (status === "published") {
      published = total;
      draft = 0;
    } else if (status === "draft") {
      published = 0;
      draft = total;
    } else if (status) {
      published = 0;
      draft = 0;
    } else {
      const statusCounts = await prisma.$queryRaw`
        SELECT status, count(*)::int AS count
        FROM articles
        WHERE 1=1 ${catSql} AND ${matchCondition}
        GROUP BY status
      `;
      for (const row of statusCounts) {
        if (row.status === "published") published = row.count;
        if (row.status === "draft") draft = row.count;
      }
    }
    const summary = { total, published, draft };
    if (rows.length === 0) return { items: [], total, summary };

    const ids = rows.map((r) => r.id);
    const articles = await prisma.article.findMany({
      where: { id: { in: ids } },
      include: countedViewInclude,
    });
    const byId = new Map(articles.map((a) => [a.id, a]));
    const items = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map(withViewCount);
    return { items, total, summary };
  }

  const where = {
    ...statusFilter,
    ...categoryFilter,
  };

  let publishedPromise;
  let draftPromise;
  if (status === "published") {
    publishedPromise = Promise.resolve(null);
    draftPromise = Promise.resolve(0);
  } else if (status === "draft") {
    publishedPromise = Promise.resolve(0);
    draftPromise = Promise.resolve(null);
  } else if (status) {
    publishedPromise = Promise.resolve(0);
    draftPromise = Promise.resolve(0);
  } else {
    publishedPromise = prisma.article.count({
      where: { ...categoryFilter, status: "published" },
    });
    draftPromise = prisma.article.count({
      where: { ...categoryFilter, status: "draft" },
    });
  }

  const [items, total, pubCount, drCount] = await Promise.all([
    prisma.article.findMany({
      where,
      include: countedViewInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.article.count({ where }),
    publishedPromise,
    draftPromise,
  ]);

  const published =
    pubCount !== null ? pubCount : status === "published" ? total : 0;
  const draft = drCount !== null ? drCount : status === "draft" ? total : 0;
  const summary = { total, published, draft };

  return { items: withViewCounts(items), total, summary };
}

async function getById(id, { allowDraft = false, tx } = {}) {
  const client = tx || prisma;
  const article = await client.article.findUnique({
    where: { id },
    include: countedViewInclude,
  });
  if (!article) return null;
  if (!allowDraft && article.status !== "published") return null;
  return withViewCount(article);
}

async function create(
  {
    title,
    slug,
    summary,
    content,
    coverImage,
    category = "general",
    status = "draft",
    authorId,
    authorName,
  },
  { tx } = {},
) {
  const client = tx || prisma;
  const isPublished = status === "published";
  const searchText =
    `${title} ${summary || ""} ${content} ${category} ${authorName || ""}`.trim();

  return withViewCount(await client.article.create({
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
    include: countedViewInclude,
  }));
}

async function update(id, data, { tx } = {}) {
  const client = tx || prisma;
  const existing = await client.article.findUnique({ where: { id } });
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
  updateData.searchText =
    `${title} ${summary} ${content} ${category} ${authorName}`.trim();

  return withViewCount(await client.article.update({
    where: { id },
    data: updateData,
    include: countedViewInclude,
  }));
}

async function remove(id, { tx } = {}) {
  const client = tx || prisma;
  return client.article.delete({
    where: { id },
  });
}

function transaction(fn) {
  return prisma.$transaction(fn);
}

module.exports = {
  searchPublished,
  getById,
  listAllForMarketing,
  create,
  update,
  remove,
  transaction,
};
