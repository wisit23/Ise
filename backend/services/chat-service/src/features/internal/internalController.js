const attachmentService = require("../attachments/attachmentService");
const fs = require("fs");
const { notFound } = require("@reloop/shared");
const internalService = require("./internalService");

// HTTP layer for the internal API. The rules live in internalService.js.

async function createConversation(req, res, next) {
  try {
    const { conversation, created } = await internalService.createCaseConversation(req.body);
    res.status(created ? 201 : 200).json(conversation);
  } catch (err) {
    next(err);
  }
}

async function getByContext(req, res, next) {
  try {
    res.json(await internalService.getByContext({
      type: req.params.type,
      id: req.params.id,
      buyerId: req.query.buyerId,
    }));
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const { message, created } = await internalService.sendSystemMessage(req.params.id, req.body);
    res.status(created ? 201 : 200).json(message);
  } catch (err) {
    next(err);
  }
}

async function addParticipant(req, res, next) {
  try {
    res.json(await internalService.addParticipant(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    res.json(await internalService.updateStatus(req.params.id, req.body.status));
  } catch (err) {
    next(err);
  }
}

async function getTranscript(req, res, next) {
  try {
    res.json(await internalService.getTranscript(req.params.id, {
      before: req.query.before,
      limit: req.query.limit,
      includeInternal: req.query.includeInternal === "true",
    }));
  } catch (err) {
    next(err);
  }
}

async function getAttachment(req, res, next) {
  try {
    const attachment = await attachmentService.resolveForInternalDownload({
      conversationId: req.params.id,
      messageId: req.params.messageId,
    });
    if (!fs.existsSync(attachment.path)) throw notFound("Attachment file unavailable");
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(attachment.filename)}"`,
    );
    fs.createReadStream(attachment.path).pipe(res);
  } catch (err) {
    next(err);
  }
}

async function deleteByContext(req, res, next) {
  try {
    res.json(await internalService.deleteByContext(req.params.type, req.params.id));
  } catch (err) {
    next(err);
  }
}

async function broadcastRealtime(req, res, next) {
  try {
    internalService.broadcastRealtime(req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAttachment,
  createConversation,
  getByContext,
  sendMessage,
  addParticipant,
  updateStatus,
  getTranscript,
  deleteByContext,
  broadcastRealtime,
};
