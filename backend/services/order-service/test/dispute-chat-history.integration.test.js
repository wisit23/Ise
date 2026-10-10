const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_ORDER) process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const chatClient = require("../src/services/chatClient");
const app = require("../src/app");
app.locals.validateAccessSession = async () => {};

function token(userId, role) {
  return signAccessToken({ sub: userId, role, roles: [role] });
}

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("T&S reads paginated ORDER chat through the dispute with access audit", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("order database unreachable");
    return;
  }

  const stamp = Date.now();
  const buyerId = `tsr10-buyer-${stamp}`;
  const sellerId = `tsr10-seller-${stamp}`;
  const safetyId = `tsr10-safety-${stamp}`;
  const order = await prisma.order.create({
    data: {
      buyerId,
      sellerId,
      productId: `tsr10-product-${stamp}`,
      productTitle: "TSR-10 chat evidence",
      price: 500,
      status: "disputed",
      payoutHeld: true,
    },
  });
  const dispute = await prisma.disputeCase.create({
    data: {
      orderId: order.id,
      openedBy: buyerId,
      reason: "ตรวจประวัติสนทนา",
      assignedRole: "TRUST_AND_SAFETY",
      assignedTo: safetyId,
    },
  });

  const original = chatClient.getOrderTranscript;
  const originalAttachment = chatClient.getOrderAttachment;
  chatClient.getOrderTranscript = async (orderId, { before, limit }) => {
    assert.equal(orderId, order.id);
    assert.equal(before, undefined);
    assert.equal(limit, 2);
    return {
      conversation: {
        id: "507f1f77bcf86cd799439011",
        contextType: "ORDER",
        contextId: order.id,
        status: "ACTIVE",
        participants: [
          { userId: buyerId, role: "BUYER", leftAt: null },
          { userId: sellerId, role: "SELLER", leftAt: null },
        ],
      },
      items: [
        {
          id: "507f1f77bcf86cd799439013",
          senderRole: "SELLER",
          type: "IMAGE",
          body: "รูปใบส่งของ",
          payload: {
            storageKey: "must-not-leak.jpg",
            filename: "receipt.jpg",
            mimeType: "image/jpeg",
            size: 4,
          },
        },
        { id: "507f1f77bcf86cd799439012", senderRole: "BUYER", body: "ขอเลขพัสดุ" },
      ],
      nextCursor: "507f1f77bcf86cd799439012",
    };
  };
  chatClient.getOrderAttachment = async (orderId, messageId) => {
    assert.equal(orderId, order.id);
    assert.equal(messageId, "507f1f77bcf86cd799439013");
    return {
      conversation: {
        id: "507f1f77bcf86cd799439011",
        participants: [
          { userId: buyerId, role: "BUYER", leftAt: null },
          { userId: sellerId, role: "SELLER", leftAt: null },
        ],
      },
      bytes: Buffer.from("jpeg"),
      contentType: "image/jpeg",
      contentDisposition: 'inline; filename="receipt.jpg"',
    };
  };

  try {
    const allowed = await request(app)
      .get(`/disputes/${dispute.id}/chat-history?limit=2`)
      .set("Authorization", `Bearer ${token(safetyId, "TRUST_AND_SAFETY")}`);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.available, true);
    assert.equal(allowed.body.items.length, 2);
    assert.equal(allowed.body.items[0].payload.storageKey, undefined);
    assert.equal(allowed.body.items[0].payload.filename, "receipt.jpg");
    assert.equal(allowed.body.nextCursor, "507f1f77bcf86cd799439012");

    const audit = await prisma.disputeAuditLog.findFirst({
      where: {
        disputeId: dispute.id,
        actorId: safetyId,
        action: "VIEW_CHAT_HISTORY",
      },
    });
    assert.ok(audit);

    const attachment = await request(app)
      .get(
        `/disputes/${dispute.id}/chat-attachments/507f1f77bcf86cd799439013`,
      )
      .set("Authorization", `Bearer ${token(safetyId, "TRUST_AND_SAFETY")}`);
    assert.equal(attachment.status, 200);
    assert.equal(Buffer.from(attachment.body).toString(), "jpeg");
    const attachmentAudit = await prisma.disputeAuditLog.findFirst({
      where: {
        disputeId: dispute.id,
        actorId: safetyId,
        action: "VIEW_CHAT_ATTACHMENT",
      },
    });
    assert.ok(attachmentAudit);

    const wrongOfficer = await request(app)
      .get(`/disputes/${dispute.id}/chat-history`)
      .set(
        "Authorization",
        `Bearer ${token(`tsr10-other-${stamp}`, "TRUST_AND_SAFETY")}`,
      );
    assert.equal(wrongOfficer.status, 403);

    const customerService = await request(app)
      .get(`/disputes/${dispute.id}/chat-history`)
      .set("Authorization", `Bearer ${token("tsr10-cs", "CUSTOMER_SERVICE")}`);
    assert.equal(customerService.status, 403);
  } finally {
    chatClient.getOrderTranscript = original;
    chatClient.getOrderAttachment = originalAttachment;
  }
});
