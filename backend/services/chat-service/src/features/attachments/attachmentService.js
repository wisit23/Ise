const { badRequest, notFound, AppError } = require("@reloop/shared");
const conversationService = require("../conversations/conversationService");
const messageModel = require("../messages/messageModel");
const prisma = require("../../models/prismaClient");
const { absolutePath } = require("./attachmentStorage");

/** image/* renders inline as a bubble; everything else (pdf, video) is
 * offered as a download. Two message types rather than one keeps the
 * rendering decision on the server side of the contract, so a client
 * doesn't have to sniff MIME strings to know how to display it. */
function messageTypeFor(mimeType) {
  return mimeType.startsWith("image/") ? "IMAGE" : "FILE";
}

/** What the inbox row shows for a message with no text of its own. Written
 * server-side so every surface (inbox list, push payload, notification)
 * agrees on the wording instead of each inventing its own placeholder. */
function previewFor(type, filename) {
  if (type === "IMAGE") return "📷 รูปภาพ";
  return `📎 ${filename}`;
}

/**
 * Attaching a file follows exactly the same authorization rules as sending
 * text (participant-only, blocked on a LOCKED conversation) — enforced by
 * reusing getForParticipant rather than re-deriving them here, so the two
 * paths cannot drift apart.
 *
 * The file has already been written to disk by multer before this runs; if
 * any check below rejects, the orphaned file is cleaned up by the caller
 * (see attachmentController) rather than being left behind.
 */
async function attach({ conversationId, senderId, file, caption }) {
  if (!file) throw badRequest("file is required");

  const conversation = await conversationService.getForParticipant(
    conversationId,
    senderId,
  );
  if (conversation.status === "LOCKED") {
    throw new AppError(409, "This conversation is locked");
  }

  const sender = conversation.participants.find((p) => p.userId === senderId);
  const type = messageTypeFor(file.mimetype);
  const body = typeof caption === "string" ? caption.trim() : "";

  const message = await messageModel.createAndTouch({
    conversationId,
    senderId,
    senderRole: sender.role,
    type,
    body,
    // storageKey is an internal filename, not a capability: the download
    // endpoint never accepts one from the client, it looks it up from the
    // message after authorizing the caller. So exposing it here is inert.
    payload: {
      storageKey: file.filename,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    },
    preview: body || previewFor(type, file.originalname),
  });

  return { message, conversation };
}

/**
 * Resolves an attachment to a path the controller can stream, having first
 * proved the caller is a participant of the conversation the attachment
 * belongs to. The messageId is scoped to the conversationId in the query on
 * purpose — without that, a participant of conversation A could read an
 * attachment from conversation B just by passing B's message id to A's URL.
 */
async function resolveForDownload({ conversationId, messageId, userId }) {
  await conversationService.getForParticipant(conversationId, userId);

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId, deletedAt: null },
  });
  if (!message) throw notFound("Attachment not found");

  const key = message.payload?.storageKey;
  if (!key) throw badRequest("This message has no attachment");

  return {
    path: absolutePath(key),
    mimeType: message.payload.mimeType || "application/octet-stream",
    filename: message.payload.filename || key,
  };
}

module.exports = { attach, resolveForDownload, messageTypeFor, previewFor };
