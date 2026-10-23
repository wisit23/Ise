const prisma = require("../../models/prismaClient");

function identityWhere(articleId, identity) {
  return identity.userId
    ? { articleId_userId: { articleId, userId: identity.userId } }
    : {
        articleId_guestSessionId: {
          articleId,
          guestSessionId: identity.guestSessionId,
        },
      };
}

function identityData(identity) {
  return identity.userId
    ? { userId: identity.userId }
    : { guestSessionId: identity.guestSessionId };
}

function createArticleViewRepository(client = prisma) {
  return {
    findPublishedArticle(articleId) {
      return client.article.findFirst({
        where: { id: articleId, status: "published" },
        select: { id: true },
      });
    },

    find(articleId, identity) {
      return client.articleView.findUnique({
        where: identityWhere(articleId, identity),
      });
    },

    start(articleId, identity, startedAt) {
      return client.articleView.upsert({
        where: identityWhere(articleId, identity),
        create: {
          articleId,
          ...identityData(identity),
          startedAt,
        },
        update: { startedAt },
      });
    },

    markCounted(id, countedAt) {
      return client.articleView.updateMany({
        where: { id, countedAt: null },
        data: { countedAt },
      });
    },

    count(articleId) {
      return client.articleView.count({
        where: { articleId, countedAt: { not: null } },
      });
    },
  };
}

module.exports = {
  createArticleViewRepository,
  articleViewRepository: createArticleViewRepository(),
};
