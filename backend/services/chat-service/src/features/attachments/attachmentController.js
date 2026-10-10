const fs = require("fs");
const multer = require("multer");
const { AppError, badRequest } = require("@reloop/shared");
const attachmentService = require("./attachmentService");
const { upload, MAX_FILE_BYTES } = require("./attachmentStorage");
const broadcast = require("../../realtime/broadcast");

/**
 * multer rejects by throwing a MulterError, which carries no `status` — so
 * without this translation the shared errorHandler defaults everything to
 * 500 and an oversized upload looks like a server fault instead of a
 * client one. Caught here rather than globally so the mapping lives next to
 * the limits it describes (attachmentStorage).
 */
function uploadErrorHandler(err, req, res, next) {
  if (!(err instanceof multer.MulterError)) return next(err);
  if (err.code === "LIMIT_FILE_SIZE") {
    const mb = Math.round(MAX_FILE_BYTES / (1024 * 1024));
    return next(new AppError(413, `ไฟล์ใหญ่เกิน ${mb} MB`));
  }
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
    return next(badRequest("แนบได้ครั้งละ 1 ไฟล์"));
  }
  return next(badRequest(err.message));
}

/** multer has already written the file to disk by the time any of our own
 * checks run, so a rejected upload (not a participant, conversation locked)
 * would otherwise leave the bytes orphaned on the volume forever. */
function discard(file) {
  if (!file) return;
  fs.unlink(file.path, () => {});
}

const send = [
  upload.single("file"),
  uploadErrorHandler,
  async (req, res, next) => {
    try {
      const { message, conversation } = await attachmentService.attach({
        conversationId: req.params.id,
        senderId: req.userId,
        file: req.file,
        caption: req.body?.caption,
      });
      // Same push as a text message — an attachment is a message, so the
      // open room renders it live and every participant's own room gets the
      // unread nudge (see broadcast.js).
      broadcast.broadcastMessage(conversation, message);
      res.status(201).json(message);
    } catch (err) {
      discard(req.file);
      next(err);
    }
  },
];

async function download(req, res, next) {
  try {
    const { path, mimeType, filename } =
      await attachmentService.resolveForDownload({
        conversationId: req.params.id,
        messageId: req.params.messageId,
        userId: req.userId,
      });

    res.setHeader("Content-Type", mimeType);
    // inline so an image can render in an <img>/blob URL, but the filename
    // is still declared for a "save as" of a pdf or video.
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    const stream = fs.createReadStream(path);
    // A missing file on disk (manually deleted, volume reset) must surface
    // as a normal error response, not an unhandled stream error that kills
    // the response mid-flight.
    stream.on("error", next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { send, download };
