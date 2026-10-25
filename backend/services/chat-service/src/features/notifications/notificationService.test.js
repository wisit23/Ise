const test = require("node:test");
const assert = require("node:assert/strict");
const notificationService = require("./notificationService");
const prisma = require("../../models/prismaClient");
const broadcast = require("../../realtime/broadcast");

test("notificationService unit tests", async (t) => {
  const dummyNotifs = [];

  const origCreate = prisma.notification.create;
  const origFindMany = prisma.notification.findMany;
  const origFindFirst = prisma.notification.findFirst;
  const origCount = prisma.notification.count;
  const origFindUnique = prisma.notification.findUnique;
  const origUpdate = prisma.notification.update;
  const origUpdateMany = prisma.notification.updateMany;
  const origDelete = prisma.notification.delete;

  t.after(() => {
    prisma.notification.create = origCreate;
    prisma.notification.findMany = origFindMany;
    prisma.notification.findFirst = origFindFirst;
    prisma.notification.count = origCount;
    prisma.notification.findUnique = origFindUnique;
    prisma.notification.update = origUpdate;
    prisma.notification.updateMany = origUpdateMany;
    prisma.notification.delete = origDelete;
  });

  prisma.notification.create = async ({ data }) => {
    const item = {
      id: `notif-${dummyNotifs.length + 1}`,
      createdAt: new Date(),
      read: false,
      readBy: [],
      ...data,
    };
    dummyNotifs.push(item);
    return item;
  };

  prisma.notification.findMany = async ({ where }) => {
    return dummyNotifs.filter((n) => {
      if (where.AND && n.deletedAt) return false;
      if (where.userId && n.userId !== where.userId) return false;
      if (typeof where.read === "boolean" && n.read !== where.read)
        return false;
      if (where.OR) {
        return where.OR.some((clause) => n.userId === clause.userId);
      }
      return true;
    });
  };

  prisma.notification.count = async ({ where }) => {
    return dummyNotifs.filter((n) => {
      if (where.userId && n.userId !== where.userId) return false;
      if (typeof where.read === "boolean" && n.read !== where.read)
        return false;
      return true;
    }).length;
  };

  prisma.notification.findUnique = async ({ where }) => {
    return dummyNotifs.find((n) => n.id === where.id) || null;
  };

  prisma.notification.findFirst = async ({ where }) => {
    return (
      dummyNotifs.find((n) => {
        if (where.userId && n.userId !== where.userId) return false;
        if (where.entityId && n.entityId !== where.entityId) return false;
        return true;
      }) || null
    );
  };

  prisma.notification.update = async ({ where, data }) => {
    const item = dummyNotifs.find((n) => n.id === where.id);
    if (!item) throw new Error("Not found");
    const { readBy, ...rest } = data;
    Object.assign(item, rest);
    if (readBy?.push) {
      item.readBy = [
        ...(Array.isArray(item.readBy) ? item.readBy : []),
        readBy.push,
      ];
    }
    return item;
  };

  prisma.notification.updateMany = async ({ where, data }) => {
    let count = 0;
    for (const item of dummyNotifs) {
      if (where.AND && item.deletedAt) continue;
      if (typeof where.id === "string" && item.id !== where.id) continue;
      if (where.userId && item.userId !== where.userId) continue;
      if (where.entityId && item.entityId !== where.entityId) continue;
      if (where.id?.not && item.id === where.id.not) continue;
      if (typeof where.read === "boolean" && item.read !== where.read) continue;
      Object.assign(item, data);
      count++;
    }
    return { count };
  };

  prisma.notification.delete = async ({ where }) => {
    const idx = dummyNotifs.findIndex((n) => n.id === where.id);
    if (idx >= 0) {
      const [removed] = dummyNotifs.splice(idx, 1);
      return removed;
    }
    throw new Error("Not found");
  };

  let broadcastCalls = [];

  t.mock.method(broadcast, "broadcastNotification", (notif) => {
    broadcastCalls.push(notif);
  });

  // 1. Create personal notification
  const personal = await notificationService.createNotification({
    userId: "user-1",
    type: "ORDER",
    title: "มีคำสั่งซื้อใหม่",
    message: "ลูกค้าสั่งสินค้า #123",
    link: "/orders",
  });
  assert.equal(personal.userId, "user-1");
  assert.equal(broadcastCalls.length, 1);
  assert.equal(broadcastCalls[0].title, "มีคำสั่งซื้อใหม่");

  // 2. Create broadcast notification
  const broadcastNotif = await notificationService.createNotification({
    userId: "ALL",
    type: "DISCOUNT",
    title: "โค้ดส่วนลดใหม่",
    message: "ลด 50% วันนี้เท่านั้น",
    link: "/campaigns",
  });
  assert.equal(broadcastNotif.userId, "ALL");
  assert.equal(broadcastCalls.length, 2);

  // 3. Unread count
  const count = await notificationService.unreadCount("user-1");
  assert.equal(count, 2); // 1 personal + 1 broadcast

  // 4. List notifications
  const list = await notificationService.listNotifications("user-1");
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].read, false);

  // 5. Mark personal read
  await notificationService.markRead(personal.id, "user-1");
  const countAfterPersonalRead =
    await notificationService.unreadCount("user-1");
  assert.equal(countAfterPersonalRead, 1);

  // 6. Mark broadcast read
  await notificationService.markRead(broadcastNotif.id, "user-1");
  const countAfterAllRead = await notificationService.unreadCount("user-1");
  assert.equal(countAfterAllRead, 0);

  // 7. Another user still has broadcast unread
  const countUser2 = await notificationService.unreadCount("user-2");
  assert.equal(countUser2, 1);

  // 8. Each order stage retains its own notification and unread state.
  const initialOrderNotif = await notificationService.createNotification({
    userId: "seller-1",
    type: "ORDER",
    title: "ผู้ซื้อชำระเงินแล้ว",
    message: "ลูกค้าชำระเงินแล้ว #ORD-1",
    link: "/products/p-1?ship=1",
    entityId: "ORD-1",
  });
  assert.equal(initialOrderNotif.title, "ผู้ซื้อชำระเงินแล้ว");

  // Shipping creates a new record without overwriting payment.
  const shippedNotif = await notificationService.createNotification({
    userId: "seller-1",
    type: "ORDER",
    title: "จัดส่งสินค้าแล้ว",
    message: "คุณได้จัดส่งสินค้าแล้ว #ORD-1",
    link: "/products/p-1",
    entityId: "ORD-1",
  });
  assert.notEqual(shippedNotif.id, initialOrderNotif.id);
  assert.equal(initialOrderNotif.title, "ผู้ซื้อชำระเงินแล้ว");
  assert.equal(shippedNotif.title, "จัดส่งสินค้าแล้ว");

  // Completion also retains the earlier stages.
  const completedNotif = await notificationService.createNotification({
    userId: "seller-1",
    type: "ORDER",
    title: "ลูกค้าได้รับสินค้าแล้ว",
    message: "ลูกค้าได้รับสินค้าแล้ว #ORD-1",
    link: "/products/p-1",
    entityId: "ORD-1",
  });
  assert.notEqual(completedNotif.id, initialOrderNotif.id);
  assert.notEqual(completedNotif.id, shippedNotif.id);
  const stages = await notificationService.listNotifications("seller-1");
  assert.equal(stages.items.filter((n) => n.entityId === "ORD-1").length, 3);
  assert.ok(
    stages.items.filter((n) => n.entityId === "ORD-1").every((n) => !n.read),
  );
  assert.equal(await notificationService.unreadCount("seller-1"), 4);
  assert.equal(completedNotif.title, "ลูกค้าได้รับสินค้าแล้ว");

  // 9. A new status increments unread count independently.
  const priorNotif = await notificationService.createNotification({
    userId: "seller-2",
    type: "ORDER",
    title: "มีคำสั่งซื้อใหม่",
    message: "ลูกค้าสร้างคำสั่งซื้อ #ORD-99",
    entityId: "ORD-99",
    metadata: { orderId: "ORD-99", status: "pending_payment" },
  });
  assert.equal(priorNotif.title, "มีคำสั่งซื้อใหม่");
  const unreadBeforePayment = await notificationService.unreadCount("seller-2");

  // Customer completes payment -> status becomes "paid"
  const paidNotif = await notificationService.createNotification({
    userId: "seller-2",
    type: "ORDER",
    title: "ผู้ซื้อชำระเงินแล้ว",
    message: "ลูกค้าชำระเงินเรียบร้อยแล้ว #ORD-99",
    entityId: "ORD-99",
    metadata: { orderId: "ORD-99", status: "paid" },
  });
  assert.notEqual(paidNotif.id, priorNotif.id);
  assert.equal(paidNotif.title, "ผู้ซื้อชำระเงินแล้ว");
  const unreadAfterPayment = await notificationService.unreadCount("seller-2");
  assert.equal(unreadAfterPayment, unreadBeforePayment + 1);
  await notificationService.markRead(paidNotif.id, "seller-2");
  assert.equal(priorNotif.read, false);
  const unreadStages = await notificationService.listNotifications("seller-2", {
    unreadOnly: true,
  });
  assert.ok(unreadStages.items.some((n) => n.id === priorNotif.id));
  assert.ok(!unreadStages.items.some((n) => n.id === paidNotif.id));

  // 10. deleteNotification tests
  // Can delete own notification
  const delResult = await notificationService.deleteNotification(
    personal.id,
    "user-1",
  );
  assert.equal(delResult.success, true);
  const foundDeleted = await prisma.notification.findUnique({
    where: { id: personal.id },
  });
  assert.ok(foundDeleted.deletedAt instanceof Date);
  assert.ok(
    !(await notificationService.listNotifications("user-1")).items.some(
      (n) => n.id === personal.id,
    ),
  );
  await assert.rejects(notificationService.markRead(personal.id, "user-1"), {
    message: "Notification not found",
  });

  // Deleting already deleted is idempotent
  const delIdempotent = await notificationService.deleteNotification(
    personal.id,
    "user-1",
  );
  assert.equal(delIdempotent.success, true);

  // Cannot delete another user's notification
  await assert.rejects(
    () =>
      notificationService.deleteNotification(
        completedNotif.id,
        "unauthorized-user",
      ),
    { message: "Access denied" },
  );
});
