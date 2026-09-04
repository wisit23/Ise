const messageService = require("./messageService");
const broadcast = require("../../realtime/broadcast");

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

async function list(req, res, next) {
  try {
    const before = req.query.before;
    const limit = clampLimit(req.query.limit);
    const result = await messageService.listMessages(
      req.params.id,
      req.userId,
      before,
      limit,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function send(req, res, next) {
  try {
    const { message, conversation } = await messageService.sendMessage(
      req.params.id,
      req.userId,
      req.body.body,
    );
    broadcast.broadcastMessage(conversation, message);
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const result = await messageService.markRead(req.params.id, req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function unreadCount(req, res, next) {
  try {
    const total = await messageService.unreadCount(req.userId);
    res.json({ total });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, send, markRead, unreadCount };
