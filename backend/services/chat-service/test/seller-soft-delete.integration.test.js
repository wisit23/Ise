const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../src/models/prismaClient");
const notifications = require("../src/features/notifications/notificationService");

test("personal notifications soft delete while legacy Mongo documents remain visible", async (t) => {
  if (!process.env.SELLER_SOFT_DELETE_TEST_DB) {
    t.skip("Requires an isolated database prepared by the rehearsal script");
    return;
  }
  const seller = "soft-delete-test-seller";
  try {
    // Raw insert deliberately omits deleted_at to represent existing documents.
    await prisma.$runCommandRaw({
      insert: "Notification",
      documents: [
        {
          userId: seller,
          title: "Legacy",
          message: "Legacy",
          type: "SYSTEM",
          read: false,
          readBy: [],
          createdAt: { $date: new Date().toISOString() },
        },
        {
          userId: "ALL",
          title: "Broadcast",
          message: "Broadcast",
          type: "SYSTEM",
          read: false,
          readBy: [],
          createdAt: { $date: new Date().toISOString() },
        },
      ],
    });
    const items = (await notifications.listNotifications(seller)).items;
    assert.equal(items.length, 2);
    assert.equal(await notifications.unreadCount(seller), 2);
    const legacy = items.find((row) => row.userId === seller);
    await assert.rejects(
      notifications.deleteNotification(legacy.id, "another-seller"),
      (error) => error.status === 403,
    );
    await notifications.deleteNotification(legacy.id, seller);
    const stored = await prisma.notification.findUnique({
      where: { id: legacy.id },
    });
    assert.ok(stored.deletedAt);
    assert.equal(stored.message, "Legacy");
    assert.equal(
      (await notifications.listNotifications(seller)).items.length,
      1,
    );
    assert.equal(await notifications.unreadCount(seller), 1);
    await assert.rejects(
      notifications.markRead(legacy.id, seller),
      (error) => error.status === 404,
    );
    await notifications.deleteNotification(legacy.id, seller);
    await notifications.markAllRead(seller);
    assert.equal(await notifications.unreadCount(seller), 0);
    assert.equal(
      (await prisma.notification.findUnique({ where: { id: legacy.id } })).read,
      false,
    );
    await notifications.deleteNotification(
      items.find((row) => row.userId === "ALL").id,
      seller,
    );
    assert.equal(
      (await notifications.listNotifications(seller)).items.length,
      1,
    );
  } finally {
    await prisma.notification.deleteMany({
      where: { userId: { in: [seller, "ALL"] } },
    });
    await prisma.$disconnect();
  }
});
