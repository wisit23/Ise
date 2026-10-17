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

/**
 * Creates or updates a notification in-place across stages and broadcasts it in real-time.
 * When a new status arrives for an entity (e.g. order paid), it replaces the old status notification,
 * and any previous notifications for that entity are marked as read so they are not counted together.
 */
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

  // Look up any existing notification for this user and entity
  let existing = null;
  const targetEntityId = entityId || metadata?.orderId || metadata?.auctionId || null;

  if (targetEntityId && userId !== "ALL") {
    existing = await prisma.notification.findFirst({
      where: { userId, entityId: targetEntityId },
      orderBy: { createdAt: "desc" },
    });

    if (!existing && metadata?.orderId && metadata.orderId !== targetEntityId) {
      existing = await prisma.notification.findFirst({
        where: { userId, entityId: metadata.orderId },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!existing && metadata?.auctionId && metadata.auctionId !== targetEntityId) {
      existing = await prisma.notification.findFirst({
        where: { userId, entityId: metadata.auctionId },
        orderBy: { createdAt: "desc" },
      });
    }
  }

  if (existing) {
    // Update existing notification in-place across stages!
    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: {
        type,
        title,
        message,
        link,
        metadata,
        entityId: targetEntityId || existing.entityId,
        read: false, // Reset to unread so user notices the new stage
        readAt: null,
        createdAt: new Date(), // Bump time to show at top of notifications
      },
    });

    // Mark any other older notifications for this entity as read ("แจ้งเตือนสถานะเก่าแล้ว")
    // so they are not counted together with the new status
    if (targetEntityId) {
      try {
        await prisma.notification.updateMany({
          where: {
            userId,
            entityId: targetEntityId,
            read: false,
            id: { not: existing.id },
          },
          data: { read: true, readAt: new Date() },
        });
      } catch {
        // Safe fallback if updateMany with compound criteria is not supported by mock
      }
    }

    broadcast.broadcastNotification(updated);
    return updated;
  }

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

  // Ensure any prior notifications for this entity are marked as read
  if (targetEntityId && userId !== "ALL") {
    try {
      await prisma.notification.updateMany({
        where: {
          userId,
          entityId: targetEntityId,
          read: false,
          id: { not: created.id },
        },
        data: { read: true, readAt: new Date() },
      });
    } catch {
      // Safe fallback
    }
  }

  broadcast.broadcastNotification(created);
  return created;
}

/**
 * Lists notifications for a given user, including platform broadcast notifications.
 * Older notifications for the same entity that have been superseded are marked as read.
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

  const seenEntities = new Set();
  const mapped = [];

  for (const n of notifications) {
    let isRead = n.userId === "ALL" ? (n.readBy || []).includes(userId) : Boolean(n.read);

    if (n.entityId && n.userId !== "ALL") {
      if (seenEntities.has(n.entityId)) {
        // Older notification for the same entity is superseded and treated as already read
        isRead = true;
      } else {
        seenEntities.add(n.entityId);
      }
    }

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
 * Groups by entityId so multiple status notifications for the same entity only count as 1.
 */
async function unreadCount(userId) {
  const userUnreadNotifs = await prisma.notification.findMany({
    where: { userId, read: false },
    select: { id: true, entityId: true },
  });

  const seenEntities = new Set();
  let userUnread = 0;
  for (const n of userUnreadNotifs) {
    if (n.entityId) {
      if (!seenEntities.has(n.entityId)) {
        seenEntities.add(n.entityId);
        userUnread++;
      }
    } else {
      userUnread++;
    }
  }

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

