const { badRequest, conflict } = require("@reloop/shared");
const { randomUUID } = require("node:crypto");
const prisma = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");

const managementInclude = {
  revisions: {
    orderBy: { version: "desc" },
    take: 1,
    include: { category: true },
  },
  publishedRevision: { include: { category: true } },
};
function toArticle(row, publicView = false) {
  if (!row) return null;
  const { revisions = [], publishedRevision, ...core } = row;
  const revision = publicView
    ? publishedRevision
    : (revisions[0] ?? publishedRevision);
  return {
    ...core,
    title: revision?.title ?? "",
    body: revision?.body ?? "",
    category: revision?.category?.code ?? "",
    version: revision?.version ?? 0,
    authorId: revision?.authorId ?? core.authorId,
    searchText: revision?.searchText ?? "",
    hasUnpublishedChanges:
      !publicView && revision?.version !== core.publishedVersion,
  };
}
async function transaction(work) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!["P2034", "P2002"].includes(error.code) || attempt >= 2) throw error;
    }
  }
}
async function categoryFor(db, code) {
  const category = await db.helpCategory.findUnique({ where: { code } });
  if (!category?.isActive)
    throw badRequest("Unknown or inactive help category");
  return category;
}
async function search({ q, category, skip = 0, take = 20 }) {
  const categoryFilter = category
    ? Prisma.sql`AND c.code = ${category}`
    : Prisma.empty;
  const match = q
    ? Prisma.sql`AND (r.search_text ILIKE '%' || ${q} || '%' OR ${q} <% r.search_text)`
    : Prisma.empty;
  const rank = q
    ? Prisma.sql`GREATEST(word_similarity(${q}, r.search_text), similarity(${q}, r.search_text))`
    : Prisma.sql`0`;
  const from = Prisma.sql`FROM help_articles a
    JOIN help_article_revisions r ON r.article_id = a.id AND r.version = a.published_version
    JOIN help_categories c ON c.help_category_id = r.help_category_id
    WHERE a.status = 'PUBLISHED' ${categoryFilter} ${match}`;
  const [ids, counts] = await Promise.all([
    prisma.$queryRaw`SELECT a.id, ${rank} AS rank ${from}
      ORDER BY rank DESC, a.updated_at DESC, a.id ASC LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw`SELECT count(*)::int AS count ${from}`,
  ]);
  const rows = ids.length
    ? await prisma.helpArticle.findMany({
        where: { id: { in: ids.map((r) => r.id) } },
        include: { publishedRevision: { include: { category: true } } },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, toArticle(r, true)]));
  return {
    items: ids.map((r) => byId.get(r.id)).filter(Boolean),
    total: counts[0].count,
  };
}
async function listAll({ status, skip = 0, take = 20 }) {
  const where = status ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.helpArticle.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
      include: managementInclude,
    }),
    prisma.helpArticle.count({ where }),
  ]);
  return { items: rows.map((r) => toArticle(r)), total };
}
async function findBySlug(slug) {
  const row = await prisma.helpArticle.findUnique({
    where: { slug },
    include: { publishedRevision: { include: { category: true } } },
  });
  return row?.status === "PUBLISHED" ? toArticle(row, true) : null;
}
async function findById(id) {
  return toArticle(
    await prisma.helpArticle.findUnique({
      where: { id },
      include: managementInclude,
    }),
  );
}
async function create({ slug, title, body, category, authorId }) {
  return transaction(async (db) => {
    const cat = await categoryFor(db, category);
    const row = await db.helpArticle.create({
      data: {
        id: randomUUID(),
        slug,
        authorId,
        status: "DRAFT",
        revisions: {
          create: { version: 1, title, body, categoryId: cat.id, authorId },
        },
      },
      include: managementInclude,
    });
    return toArticle(row);
  });
}
async function revise({ id, title, body, category, authorId }) {
  return transaction(async (db) => {
    const article = await db.helpArticle.findUnique({
      where: { id },
      include: managementInclude,
    });
    if (!article) return null;
    if (article.status === "ARCHIVED")
      throw conflict("Archived articles cannot be revised");
    const cat = await categoryFor(db, category);
    await db.helpArticleRevision.create({
      data: {
        articleId: id,
        version: (article.revisions[0]?.version ?? 0) + 1,
        title,
        body,
        categoryId: cat.id,
        authorId,
      },
    });
    await db.helpArticle.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
    return toArticle(
      await db.helpArticle.findUnique({
        where: { id },
        include: managementInclude,
      }),
    );
  });
}
async function publish(id, version) {
  return transaction(async (db) => {
    const article = await db.helpArticle.findUnique({
      where: { id },
      include: managementInclude,
    });
    if (!article) return null;
    if (article.status === "ARCHIVED")
      throw conflict("Archived articles cannot be published");
    const selected = version ?? article.revisions[0]?.version;
    if (!Number.isInteger(selected) || selected < 1)
      throw badRequest("A valid revision version is required");
    const revision = await db.helpArticleRevision.findUnique({
      where: { articleId_version: { articleId: id, version: selected } },
    });
    if (!revision) throw badRequest("Revision does not belong to this article");
    return toArticle(
      await db.helpArticle.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          publishedVersion: selected,
          publishedAt: new Date(),
        },
        include: managementInclude,
      }),
      true,
    );
  });
}
module.exports = {
  search,
  listAll,
  findBySlug,
  findById,
  create,
  revise,
  publish,
  toArticle,
};
