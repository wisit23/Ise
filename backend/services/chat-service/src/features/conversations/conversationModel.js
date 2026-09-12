const prisma = require("../../models/prismaClient");

function findByContextKey(contextKey) {
  return prisma.conversation.findUnique({ where: { contextKey } });
}

function findById(id) {
  return prisma.conversation.findUnique({ where: { id } });
}

function create({
  contextType,
  contextId,
  contextKey,
  createdBy,
  participants,
}) {
  return prisma.conversation.create({
    data: {
      contextType,
      contextId,
      contextKey,
      status: "ACTIVE",
      createdBy,
      participants,
    },
  });
}

// Ordered by lastMessageAt desc so an empty conversation (never messaged)
// sorts last, not by createdAt — an inbox should read like "most recently
// active first", same as every chat app.
function listForParticipant(userId, filter = {}) {
  const where = { participants: { some: { userId } } };
  if (filter.excludeContextType) {
    where.contextType = { not: filter.excludeContextType };
  }
  if (filter.contextType) {
    where.contextType = filter.contextType;
  }
  return prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
  });
}

module.exports = { findByContextKey, findById, create, listForParticipant };
