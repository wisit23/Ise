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
async function listForParticipant(userId, filter = {}) {
  const hidden = await prisma.inboxDismissal.findMany({ where: { userId } });
  const where = { participants: { some: { userId } } };
  if (hidden.length) where.id = { notIn: hidden.map((item) => item.conversationId) };
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

function hideForParticipant(conversationId, userId) {
  const id = JSON.stringify([conversationId, userId]);
  const hiddenAt = new Date();
  return prisma.inboxDismissal.upsert({
    where: { id },
    create: { id, conversationId, userId, hiddenAt },
    update: { hiddenAt },
  });
}

function restoreForParticipant(conversationId, userId) {
  return prisma.inboxDismissal.deleteMany({ where: { conversationId, userId } });
}

module.exports = { findByContextKey, findById, create, listForParticipant, hideForParticipant, restoreForParticipant };
