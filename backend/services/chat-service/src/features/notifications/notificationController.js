const notificationService = require("./notificationService");

async function list(req, res, next) {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = req.query.limit;
    const result = await notificationService.listNotifications(req.userId, {
      limit,
      unreadOnly,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function unreadCount(req, res, next) {
  try {
    const total = await notificationService.unreadCount(req.userId);
    res.json({ total });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const result = await notificationService.markRead(req.params.id, req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const result = await notificationService.markAllRead(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createInternal(req, res, next) {
  try {
    const { userId, type, title, message, link, metadata, entityId } = req.body;
    const notification = await notificationService.createNotification({
      userId,
      type,
      title,
      message,
      link,
      metadata,
      entityId,
    });
    res.status(201).json(notification);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await notificationService.deleteNotification(
      req.params.id,
      req.userId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  remove,
  createInternal,
};

