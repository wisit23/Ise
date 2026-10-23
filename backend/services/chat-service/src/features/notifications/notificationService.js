const prisma = require("../../models/prismaClient");
const broadcast = require("../../realtime/broadcast");
const { AppError } = require("@reloop/shared");

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/** Each event is a separate notification; entityId links history, not identity. */
async function createNotification({
  userId = "ALL",
  type = "SYSTEM",
  title,
  message,
  link = null,
  metadata = null,
  entityId = null,
}) {
  if (!title || !message) {
    throw new AppError(400, "Title and message are required for notification");
  }

  const targetEntityId = entityId || metadata?.orderId || metadata?.auctionId || null;

  const created = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      link,
      metadata,
      entityId: targetEntityId,
      read: false,
      readBy: [],
    },
  });

  broadcast.broadcastNotification(created);
  return created;
}

/**
 * Lists notifications for a given user, including platform broadcast notifications.
 * Read state belongs to each notification, independent of later entity updates.
 */
async function listNotifications(userId, { limit = DEFAULT_LIMIT, unreadOnly = false } = {}) {
  const take = clampLimit(limit);
  const notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { userId },
        { userId: "ALL" },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: take * 2,
  });

  const mapped = [];

  for (const n of notifications) {
    const isRead = n.userId === "ALL" ? (n.readBy || []).includes(userId) : Boolean(n.read);

    mapped.push({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      metadata: n.metadata,
      entityId: n.entityId || null,
      read: isRead,
      createdAt: n.createdAt,
    });
  }

  const items = (unreadOnly ? mapped.filter((n) => !n.read) : mapped).slice(0, take);
  return { items, total: items.length };
}

/**
 * Calculates total unread notification count for a user (personal + broadcast).
 * Every unread status notification counts, even for the same order.
 */
async function unreadCount(userId) {
  const userUnreadNotifs = await prisma.notification.findMany({
    where: { userId, read: false },
    select: { id: true, entityId: true },
  });

  const userUnread = userUnreadNotifs.length;

  const broadcastNotifications = await prisma.notification.findMany({
    where: { userId: "ALL" },
    select: { readBy: true },
  });

  const broadcastUnread = broadcastNotifications.filter(
    (n) => !(n.readBy || []).includes(userId),
  ).length;

  return userUnread + broadcastUnread;
}

/**
 * Marks a single notification as read for the user.
 */
async function markRead(notificationId, userId) {
  const notif = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notif) {
    throw new AppError(404, "Notification not found");
  }

  if (notif.userId === "ALL") {
    if (!(notif.readBy || []).includes(userId)) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { readBy: { push: userId } },
      });
    }
  } else {
    if (notif.userId !== userId) {
      throw new AppError(403, "Access denied");
    }
    await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });
  }

  return { success: true };
}

/**
 * Marks all notifications (personal and broadcast) as read for the user.
 */
async function markAllRead(userId) {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });

  const broadcastUnread = await prisma.notification.findMany({
    where: { userId: "ALL" },
  });

  await Promise.all(
    broadcastUnread.map((n) => {
      if (!(n.readBy || []).includes(userId)) {
        return prisma.notification.update({
          where: { id: n.id },
          data: { readBy: { push: userId } },
        });
      }
      return Promise.resolve();
    }),
  );

  return { success: true };
}

/**
 * Deletes a notification by id for a user.
 */
async function deleteNotification(notificationId, userId) {
  const notif = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notif) {
    return { success: true };
  }

  if (notif.userId !== userId && notif.userId !== "ALL") {
    throw new AppError(403, "Access denied");
  }

  if (notif.userId === "ALL") {
    return { success: true };
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });

  return { success: true };
}

module.exports = {
  createNotification,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  deleteNotification,
};

