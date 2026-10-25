const prisma = require("../../models/prismaClient");
const { createWithReferenceCode } = require("@reloop/shared");

function findByContextKey(contextKey) {
  return prisma.conversation.findUnique({ where: { contextKey } });
}

function findById(id) {
  return prisma.conversation.findUnique({ where: { id } });
}

function create({
  id,
  contextType,
  contextId,
  contextKey,
  createdBy,
  participants,
}) {
  return createWithReferenceCode("CHT", (referenceCode) => prisma.conversation.create({
    data: {
      referenceCode,
      ...(id ? { id } : {}),
      contextType,
      contextId,
      contextKey,
      status: "ACTIVE",
      createdBy,
      participants,
    },
  }));
}

// Ordered by lastMessageAt desc so an empty conversation (never messaged)
// sorts last, not by createdAt — an inbox should read like "most recently
// active first", same as every chat app.
function listForParticipant(userId, filter = {}) {
  const where = { participants: { some: { userId } } };
  if (filter.excludeContextType) {
    where.contextType = { not: filter.excludeContextType };
  }
  if (filter.excludeContextTypes) {
    where.contextType = { notIn: filter.excludeContextTypes };
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
