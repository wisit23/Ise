// Integration test against a real, disposable MongoDB replica set
// (reloop_chat). Skips cleanly when DATABASE_URL is unset/unreachable so
// `npm test` still passes on a machine with no Mongo running. Set
// REQUIRE_INTEGRATION=1 (the CI workflow does) to turn that skip into a hard
// failure instead — see conversation.integration.test.js for the same
// pattern applied to the Conversation feature.
const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

if (process.env.DATABASE_URL_CHAT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_CHAT;
}
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";

// Bulk-seeding through the public API would otherwise trip the per-user send
// limit (see src/limits.js) — raised HERE rather than lowering the real limit,
// which stays exactly what production runs.
process.env.CHAT_RATE_LIMIT_SEND_MESSAGE ||= "100000";
process.env.CHAT_RATE_LIMIT_UPLOAD_ATTACHMENT ||= "100000";
process.env.CHAT_RATE_LIMIT_CREATE_CONVERSATION ||= "100000";

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// The rate limiter opens a Redis connection lazily on the first limited
// request; without closing it the test process stays alive forever.
const { closeRateLimitClient } = require("../src/middleware/rateLimit");

const TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
const buyerId = `int-test-internal-buyer-${Date.now()}`;
const sellerId = `int-test-internal-seller-${Date.now()}`;

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

test("Internal API against a real MongoDB replica set", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_CHAT not set or MongoDB unreachable — set it to a disposable replica-set " +
      "database (see docs/featureplan/chat/plan.md CHAT-001) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  await t.test("no x-internal-token is rejected with 403", async () => {
    const res = await request(app)
      .post("/internal/conversations")
      .send({
        contextType: "ORDER",
        contextId: "order-1",
        participants: [{ userId: buyerId, role: "BUYER" }],
      });
    assert.equal(res.status, 403);
  });

  await t.test("wrong x-internal-token is rejected with 403", async () => {
    const res = await request(app)
      .post("/internal/conversations")
      .set("x-internal-token", "totally-wrong-token")
      .send({
        contextType: "ORDER",
        contextId: "order-1",
        participants: [{ userId: buyerId, role: "BUYER" }],
      });
    assert.equal(res.status, 403);
  });

  const orderId = `int-test-order-${Date.now()}`;
  let conversationId;

  await t.test(
    "creates an ORDER-context conversation with the given participants",
    async () => {
      const res = await request(app)
        .post("/internal/conversations")
        .set("x-internal-token", TOKEN)
        .send({
          contextType: "ORDER",
          contextId: orderId,
          createdBy: "system",
          participants: [
            { userId: buyerId, role: "BUYER" },
            { userId: sellerId, role: "SELLER" },
          ],
        });
      assert.equal(res.status, 201);
      assert.equal(res.body.contextType, "ORDER");
      assert.equal(res.body.contextKey, `ORDER:${orderId}`);
      assert.equal(res.body.participants.length, 2);
      conversationId = res.body.id;
    },
  );

  await t.test(
    "creating again for the same context returns the SAME conversation (200, not 201)",
    async () => {
      const res = await request(app)
        .post("/internal/conversations")
        .set("x-internal-token", TOKEN)
        .send({
          contextType: "ORDER",
          contextId: orderId,
          participants: [{ userId: buyerId, role: "BUYER" }],
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, conversationId);
    },
  );

  await t.test("by-context lookup finds it", async () => {
    const res = await request(app)
      .get(`/internal/conversations/by-context/ORDER/${orderId}`)
      .set("x-internal-token", TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, conversationId);
  });

  await t.test(
    "by-context lookup 404s for a context that doesn't exist",
    async () => {
      const res = await request(app)
        .get(`/internal/conversations/by-context/ORDER/no-such-order`)
        .set("x-internal-token", TOKEN);
      assert.equal(res.status, 404);
    },
  );

  await t.test(
    "sends a SYSTEM message with no participant/lock check",
    async () => {
      const res = await request(app)
        .post(`/internal/conversations/${conversationId}/messages`)
        .set("x-internal-token", TOKEN)
        .send({
          senderId: "system",
          senderRole: "SYSTEM",
          type: "SYSTEM",
          body: "ผู้ขายยืนยันคำสั่งซื้อแล้ว",
          payload: { event: "order.confirmed", orderId },
        });
      assert.equal(res.status, 201);
      assert.equal(res.body.type, "SYSTEM");
      assert.equal(res.body.senderId, "system");

      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      assert.equal(conv.lastMessagePreview, "ผู้ขายยืนยันคำสั่งซื้อแล้ว");
    },
  );

  await t.test(
    "adding an already-active participant is idempotent",
    async () => {
      const before = await request(app)
        .get(`/internal/conversations/by-context/ORDER/${orderId}`)
        .set("x-internal-token", TOKEN);
      const countBefore = before.body.participants.length;

      const res = await request(app)
        .post(`/internal/conversations/${conversationId}/participants`)
        .set("x-internal-token", TOKEN)
        .send({ userId: buyerId, role: "BUYER" });
      assert.equal(res.status, 200);
      assert.equal(res.body.participants.length, countBefore);
    },
  );

  await t.test(
    "adds a genuinely new participant (e.g. a CS agent)",
    async () => {
      const agentId = `int-test-agent-${Date.now()}`;
      const res = await request(app)
        .post(`/internal/conversations/${conversationId}/participants`)
        .set("x-internal-token", TOKEN)
        .send({ userId: agentId, role: "AGENT" });
      assert.equal(res.status, 200);
      assert.ok(
        res.body.participants.some(
          (p) => p.userId === agentId && p.role === "AGENT",
        ),
      );
    },
  );

  await t.test(
    "updates status to LOCKED, and public sends now get 409",
    async () => {
      const statusRes = await request(app)
        .patch(`/internal/conversations/${conversationId}/status`)
        .set("x-internal-token", TOKEN)
        .send({ status: "LOCKED" });
      assert.equal(statusRes.status, 200);
      assert.equal(statusRes.body.status, "LOCKED");

      // Cross-check against the PUBLIC path (messageService.sendMessage),
      // proving the Internal API's status change actually affects buyer/
      // seller behavior, not just its own read.
      const { signAccessToken } = require("@reloop/shared");
      const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
      const publicSendRes = await request(app)
        .post(`/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ body: "can I still send this?" });
      assert.equal(publicSendRes.status, 409);

      // But an internal SYSTEM message still goes through even while locked.
      const internalSendRes = await request(app)
        .post(`/internal/conversations/${conversationId}/messages`)
        .set("x-internal-token", TOKEN)
        .send({
          senderId: "system",
          senderRole: "SYSTEM",
          body: "ห้องนี้ถูกล็อกโดยแอดมิน",
        });
      assert.equal(internalSendRes.status, 201);
    },
  );

  await t.test(
    "transcript returns the full, unpaginated message history",
    async () => {
      const res = await request(app)
        .get(`/internal/conversations/${conversationId}/transcript`)
        .set("x-internal-token", TOKEN);
      assert.equal(res.status, 200);
      assert.equal(res.body.conversation.id, conversationId);
      // The two SYSTEM messages sent above.
      assert.equal(res.body.messages.length, 2);
      assert.equal(
        res.body.messages[0].createdAt <= res.body.messages[1].createdAt,
        true,
      );
    },
  );

  await t.test("SUPPORT context works the same way as ORDER", async () => {
    const ticketId = `int-test-ticket-${Date.now()}`;
    const requesterId = `int-test-requester-${Date.now()}`;
    const agentId = `int-test-sup-agent-${Date.now()}`;

    const createRes = await request(app)
      .post("/internal/conversations")
      .set("x-internal-token", TOKEN)
      .send({
        contextType: "SUPPORT",
        contextId: ticketId,
        participants: [
          { userId: requesterId, role: "BUYER" },
          { userId: agentId, role: "AGENT" },
        ],
      });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.contextKey, `SUPPORT:${ticketId}`);
  });

  await t.test(
    "PRODUCT context is rejected — not supported via the Internal API's single-contextId creation",
    async () => {
      const res = await request(app)
        .post("/internal/conversations")
        .set("x-internal-token", TOKEN)
        .send({
          contextType: "PRODUCT",
          contextId: "some-product",
          participants: [{ userId: buyerId, role: "BUYER" }],
        });
      assert.equal(res.status, 400);
    },
  );
});

// Runs once after every test in this file, whether they passed, failed or
// skipped — the limiter's Redis connection is opened lazily on the first
// limited request and would otherwise hold the process open.
after(async () => {
  await closeRateLimitClient();
});
