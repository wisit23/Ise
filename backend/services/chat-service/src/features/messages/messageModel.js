const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { buildPageQuery, paginate } = require("./cursor");
const { MAX_MESSAGE_LENGTH } = require("../../limits");

async function listPage(conversationId, before, limit) {
  const { where, orderBy, take } = buildPageQuery({
    conversationId,
    before,
    limit,
  });
  const rows = await prisma.message.findMany({ where, orderBy, take });
  return paginate(rows, limit);
}

const PREVIEW_LENGTH = 120;

/**
 * The one place that writes a Message and touches its Conversation's
 * lastMessageAt/lastMessagePreview — shared by the public send path
 * (messageService.sendMessage, which does participant/lock checks first)
 * and the Internal API's SYSTEM-message path (internalController, which
 * trusts the calling service instead of checking participants). Both go
 * through the same $transaction here so neither can produce a Message
 * without the matching Conversation preview update, or vice versa.
 */
async function createAndTouch({
  conversationId,
  senderId,
  senderRole,
  type,
  body,
  payload,
  preview: previewOverride,
}) {
  // Enforced HERE, at the one function every write path goes through, for
  // the same reason getForParticipant is the one authorization point: a
  // check in the controllers would have to be repeated in the Internal API
  // path, the attachment-caption path, and every path added later — and
  // whichever one gets forgotten becomes the hole. Callers can't opt out.
  if (typeof body === "string" && body.length > MAX_MESSAGE_LENGTH) {
    throw badRequest(
      `ข้อความยาวเกิน ${MAX_MESSAGE_LENGTH.toLocaleString("th-TH")} ตัวอักษร`,
    );
  }

  // An attachment with no caption has no body to preview, and "[IMAGE]" is
  // not something to show a user — attachmentService passes a human-readable
  // override instead. Callers that don't care keep the old behaviour.
  const preview = (previewOverride || (body ? body : `[${type}]`)).slice(
    0,
    PREVIEW_LENGTH,
  );
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderId,
        senderRole,
        type,
        body: body || "",
        payload: payload ?? null,
        // See messageService.sendMessage's comment on this same field —
        // Prisma's MongoDB connector needs it written explicitly or every
        // `deletedAt: null` read filter silently excludes this message.
        deletedAt: null,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: preview },
    }),
  ]);
  return message;
}

function countUnread({ conversationId, userId, since }) {
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      createdAt: { gt: since },
    },
  });
}

module.exports = { listPage, countUnread, createAndTouch };
