const test = require("node:test");
const assert = require("node:assert/strict");

const sentNotifications = [];
const prismaCalls = {
  reports: [],
  audits: [],
  users: [],
};

const mockReports = [];

const prisma = {
  $transaction: async (cb) => cb(prisma),
  $queryRaw: async () => [{ id: "locked" }],
  report: {
    findFirst: async ({ where }) => {
      return mockReports.find((r) => {
        if (where.reporterId && r.reporterId !== where.reporterId) return false;
        if (where.status?.in && !where.status.in.includes(r.status)) return false;
        if (where.productId && r.productId !== where.productId) return false;
        if (where.NOT?.reason?.contains && r.reason.includes(where.NOT.reason.contains)) return false;
        if (where.reason?.contains && !r.reason.includes(where.reason.contains)) return false;
        if (where.OR) {
          const matchOr = where.OR.some((cond) => {
            if (cond.reason?.contains && r.reason.includes(cond.reason.contains)) return true;
            if (cond.AND) {
              return cond.AND.every((sub) => {
                if (sub.targetId && r.targetId !== sub.targetId) return false;
                if (sub.productId && r.productId !== sub.productId) return false;
                if (sub.reason?.contains && !r.reason.includes(sub.reason.contains)) return false;
                return true;
              });
            }
            return false;
          });
          if (!matchOr) return false;
        }
        return true;
      }) || null;
    },
    create: async ({ data }) => {
      const created = { id: `rep-${mockReports.length + 1}`, status: "OPEN", ...data };
      mockReports.push(created);
      return created;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const r of mockReports) {
        if (r.id === where.id && (where.status === undefined || r.status === where.status)) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    },
    findUnique: async ({ where }) => {
      return mockReports.find((r) => r.id === where.id) || null;
    },
    findMany: async ({ where }) => {
      return mockReports.filter((r) => {
        if (where.reporterId && r.reporterId !== where.reporterId) return false;
        if (where.status?.in && !where.status.in.includes(r.status)) return false;
        if (where.productId && r.productId !== where.productId) return false;
        if (where.reason?.contains && !r.reason.includes(where.reason.contains)) return false;
        return true;
      });
    },

  },
  user: {
    findUnique: async ({ where }) => ({
      id: where.id,
      email: `${where.id}@example.com`,
      firstName: "Test",
      lastName: "User",
      status: "ACTIVE",
    }),
    update: async ({ where, data }) => ({
      id: where.id,
      status: data.status,
    }),
  },
  refreshToken: {
    updateMany: async () => ({ count: 1 }),
  },
  adminAudit: {
    create: async ({ data }) => {
      prismaCalls.audits.push(data);
      return { id: "audit-1", ...data };
    },
    findFirst: async () => null,
    count: async () => 0,
  },
};

const chatClient = {
  sendSystemNotification: async (notif) => {
    sentNotifications.push(notif);
    return { ok: true };
  },
};

const productModerationClient = {
  getProduct: async (id) => ({
    id,
    title: "เสื้อยืดวินเทจ",
    sellerId: "seller-user-99",
  }),
  removeProduct: async () => ({ success: true }),
};

// Wire mocks
const prismaPath = require.resolve("../src/models/prismaClient");
const chatClientPath = require.resolve("../src/services/chatClient");
const productClientPath = require.resolve("../src/services/productModerationClient");

require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prisma,
};
require.cache[chatClientPath] = {
  id: chatClientPath,
  filename: chatClientPath,
  loaded: true,
  exports: chatClient,
};
require.cache[productClientPath] = {
  id: productClientPath,
  filename: productClientPath,
  loaded: true,
  exports: productModerationClient,
};

const reportService = require("../src/features/reports/reportService");

test("Requirement 2: cannot report the same product if pending admin decision", async () => {
  mockReports.length = 0;
  sentNotifications.length = 0;

  // First report for product-1
  const first = await reportService.createReport({
    reporterId: "buyer-1",
    productId: "prod-100",
    reason: "สินค้าละเมิดลิขสิทธิ์",
  });
  assert.equal(first.productId, "prod-100");
  assert.equal(first.status, "OPEN");

  // Duplicate report attempt while status is OPEN
  await assert.rejects(
    reportService.createReport({
      reporterId: "buyer-1",
      productId: "prod-100",
      reason: "พบการละเมิดลิขสิทธิ์เพิ่มเติม",
    }),
    (err) => err.status === 409 && /คุณได้รายงานสินค้านี้ไปแล้ว/.test(err.message),
  );

  // Different user can still report
  const otherUserReport = await reportService.createReport({
    reporterId: "buyer-2",
    productId: "prod-100",
    reason: "ผู้ซื้ออีกคนรายงาน",
  });
  assert.equal(otherUserReport.reporterId, "buyer-2");

  // checkPendingReport returns pending for buyer-1, not for buyer-3
  const checkPendingBuyer1 = await reportService.checkPendingReport({
    reporterId: "buyer-1",
    productId: "prod-100",
  });
  assert.equal(checkPendingBuyer1.hasPendingReport, true);

  const checkPendingBuyer3 = await reportService.checkPendingReport({
    reporterId: "buyer-3",
    productId: "prod-100",
  });
  assert.equal(checkPendingBuyer3.hasPendingReport, false);
});

test("Requirement 2: cannot report the same review/comment if pending admin decision", async () => {
  mockReports.length = 0;
  sentNotifications.length = 0;

  // First report for review rev-999
  const first = await reportService.createReport({
    reporterId: "seller-1",
    targetId: "reviewer-88",
    productId: "prod-100",
    reviewId: "rev-999",
    reason: "[รายงานรีวิว #rev-999] [รีวิวเท็จ] ไม่ได้สั่งจริง",
  });
  assert.equal(first.status, "OPEN");

  // Target reviewer gets initial notification that their review was reported
  assert.ok(sentNotifications.some((n) => n.userId === "reviewer-88" && n.title.includes("ถูกรายงาน")));

  // Duplicate review report attempt while status is OPEN
  await assert.rejects(
    reportService.createReport({
      reporterId: "seller-1",
      targetId: "reviewer-88",
      productId: "prod-100",
      reviewId: "rev-999",
      reason: "[รายงานรีวิว #rev-999] รายงานซ้ำ",
    }),
    (err) => err.status === 409 && /คุณได้รายงานความคิดเห็นนี้ไปแล้ว/.test(err.message),
  );

  // Check pending report returns true
  const check = await reportService.checkPendingReport({
    reporterId: "seller-1",
    reviewId: "rev-999",
  });
  assert.equal(check.hasPendingReport, true);
  assert.equal(check.type, "review");
});

test("Requirement 2: user CAN report again once admin has decided (ACTIONED or DISMISSED)", async () => {
  mockReports.length = 0;
  sentNotifications.length = 0;

  const rep = await reportService.createReport({
    reporterId: "buyer-1",
    productId: "prod-200",
    reason: "รายงานครั้งแรก",
  });

  // Admin reviews and dismisses report
  await reportService.reviewReport({ reportId: rep.id, adminId: "admin-1" });
  await reportService.actionReport({
    reportId: rep.id,
    adminId: "admin-1",
    decision: "DISMISS",
    reason: "ตรวจสอบแล้วไม่พบความผิดปกติ",
  });

  // Now report status is DISMISSED
  const decided = await prisma.report.findUnique({ where: { id: rep.id } });
  assert.equal(decided.status, "DISMISSED");

  // checkPendingReport returns false
  const check = await reportService.checkPendingReport({
    reporterId: "buyer-1",
    productId: "prod-200",
  });
  assert.equal(check.hasPendingReport, false);

  // Buyer-1 is now allowed to report again
  const second = await reportService.createReport({
    reporterId: "buyer-1",
    productId: "prod-200",
    reason: "มีหลักฐานใหม่พบการทำผิดซ้ำ",
  });
  assert.equal(second.status, "OPEN");
});

test("Requirement 1: admin decision notifies all relevant parties (reporter, target, seller)", async () => {
  mockReports.length = 0;
  sentNotifications.length = 0;

  // File a product review report
  const rep = await reportService.createReport({
    reporterId: "reporter-user-1",
    targetId: "target-user-2",
    productId: "prod-300",
    reviewId: "rev-123",
    reason: "[รายงานรีวิว #rev-123] [ข้อความหยาบคาย] ใช้ถ้อยคำคุกคาม",
  });

  // Review report
  await reportService.reviewReport({ reportId: rep.id, adminId: "admin-1" });

  sentNotifications.length = 0; // Clear previous notifications

  // Admin takes action: WARN_USER
  await reportService.actionReport({
    reportId: rep.id,
    adminId: "admin-1",
    decision: "WARN_USER",
    reason: "พบการใช้ถ้อยคำไม่เหมาะสมในรีวิวจริง ตักเตือนผู้ใช้",
  });

  // Check notifications sent:
  // 1) Reporter must be notified of the verdict
  const reporterNotif = sentNotifications.find((n) => n.userId === "reporter-user-1");
  assert.ok(reporterNotif, "Reporter must receive verdict notification");
  assert.equal(reporterNotif.title, "ผลการพิจารณารายงาน");
  assert.ok(reporterNotif.message.includes("ตักเตือนผู้ใช้"));
  assert.ok(reporterNotif.message.includes("พบการใช้ถ้อยคำไม่เหมาะสมในรีวิวจริง"));

  // 2) Target user must be notified
  const targetNotif = sentNotifications.find((n) => n.userId === "target-user-2");
  assert.ok(targetNotif, "Target user must receive warning notification");
  assert.equal(targetNotif.title, "แจ้งเตือนคำเตือนจากผู้ดูแลระบบ");
  assert.ok(targetNotif.message.includes("พบการใช้ถ้อยคำไม่เหมาะสมในรีวิวจริง"));

  // 3) Product seller must be notified
  const sellerNotif = sentNotifications.find((n) => n.userId === "seller-user-99");
  assert.ok(sellerNotif, "Product seller must receive notification");
  assert.equal(sellerNotif.title, "ผลการพิจารณารายงานในสินค้าของคุณ");
  assert.ok(sellerNotif.message.includes("เสื้อยืดวินเทจ"));
  assert.ok(sellerNotif.message.includes("ตักเตือนผู้ใช้"));
});

test("Requirement 1: direct admin actions (suspend, warn, restore) notify target user", async () => {
  sentNotifications.length = 0;

  // Direct suspend
  await reportService.suspendUser({
    targetId: "user-to-suspend",
    adminId: "admin-1",
    reason: "พฤติกรรมฉ้อโกงซ้ำซ้อน",
  });
  const suspendNotif = sentNotifications.find((n) => n.userId === "user-to-suspend");
  assert.ok(suspendNotif, "Suspended user must be notified");
  assert.equal(suspendNotif.title, "บัญชีของคุณถูกระงับการใช้งาน");
  assert.ok(suspendNotif.message.includes("พฤติกรรมฉ้อโกงซ้ำซ้อน"));

  // Direct warn
  await reportService.warnUser({
    targetId: "user-to-warn",
    adminId: "admin-1",
    reason: "โพสต์ภาพไม่ตรงกับสินค้าจริง",
  });
  const warnNotif = sentNotifications.find((n) => n.userId === "user-to-warn");
  assert.ok(warnNotif, "Warned user must be notified");
  assert.equal(warnNotif.title, "แจ้งเตือนคำเตือนจากผู้ดูแลระบบ");
  assert.ok(warnNotif.message.includes("โพสต์ภาพไม่ตรงกับสินค้าจริง"));
});

test("Requirement 1: getMyReportedReviewIds returns pending reported review IDs", async () => {
  mockReports.length = 0;
  mockReports.push({
    id: "rep-rev-1",
    reporterId: "user-buyer-1",
    productId: "product-101",
    targetId: "review-author-1",
    status: "OPEN",
    reason: "[รายงานรีวิว #rev-abc] [SPAM] ข้อมูลเท็จ",
  });
  mockReports.push({
    id: "rep-rev-2",
    reporterId: "user-buyer-1",
    productId: "product-101",
    targetId: "review-author-2",
    status: "REVIEWED",
    reason: "[รายงานรีวิว #rev-xyz] [HARASSMENT] ข้อความไม่เหมาะสม",
  });
  mockReports.push({
    id: "rep-rev-3",
    reporterId: "user-buyer-1",
    productId: "product-101",
    targetId: "review-author-3",
    status: "ACTIONED", // Already decided - should NOT be included
    reason: "[รายงานรีวิว #rev-resolved] [SPAM]",
  });

  const ids = await reportService.getMyReportedReviewIds("user-buyer-1", "product-101");
  assert.deepEqual(ids, ["rev-abc", "rev-xyz"]);
});

