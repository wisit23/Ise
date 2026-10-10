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
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};
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

  await t.test(
    "AUCTION context: 1-on-1 user isolation, 'ระบบฝ่ายการตลาด' display name, and 403 read-only enforcement on replies and attachments",
    async () => {
      const { signAccessToken } = require("@reloop/shared");
      const roundId = `int-round-${Date.now()}`;
      const aucSellerId = `int-auc-seller-${Date.now()}`;
      const aucBuyer1Id = `int-auc-buyer1-${Date.now()}`;
      const aucBuyer2Id = `int-auc-buyer2-${Date.now()}`;

      const sellerConvRes = await request(app)
        .post("/internal/conversations")
        .set("x-internal-token", TOKEN)
        .send({
          contextType: "AUCTION",
          contextId: `${roundId}:${aucSellerId}`,
          createdBy: "system-marketing",
          participants: [
            { userId: aucSellerId, role: "SELLER" },
            { userId: "system-marketing", role: "SYSTEM" },
          ],
        });
      assert.equal(sellerConvRes.status, 201);
      assert.equal(sellerConvRes.body.participants.length, 2);

      const buyer1ConvRes = await request(app)
        .post("/internal/conversations")
        .set("x-internal-token", TOKEN)
        .send({
          contextType: "AUCTION",
          contextId: `${roundId}:${aucBuyer1Id}`,
          createdBy: "system-marketing",
          participants: [
            { userId: aucBuyer1Id, role: "BUYER" },
            { userId: "system-marketing", role: "SYSTEM" },
          ],
        });
      assert.equal(buyer1ConvRes.status, 201);
      assert.equal(buyer1ConvRes.body.participants.length, 2);
      assert.notEqual(
        sellerConvRes.body.id,
        buyer1ConvRes.body.id,
        "Seller and Buyer must receive strictly isolated 1-on-1 AUCTION rooms",
      );

      // Deliver system messages to each isolated room
      const sellerMsgRes = await request(app)
        .post(`/internal/conversations/${sellerConvRes.body.id}/messages`)
        .set("x-internal-token", TOKEN)
        .send({
          senderId: "system-marketing",
          senderRole: "SYSTEM",
          type: "SYSTEM",
          body: "แจ้งผู้ขาย: รอบประมูลถูกยกเลิก",
          idempotencyKey: `auction.round_cancelled:${roundId}:${aucSellerId}`,
          payload: { event: "auction.round_cancelled", roundId },
        });
      assert.equal(sellerMsgRes.status, 201);

      const buyer1MsgRes = await request(app)
        .post(`/internal/conversations/${buyer1ConvRes.body.id}/messages`)
        .set("x-internal-token", TOKEN)
        .send({
          senderId: "system-marketing",
          senderRole: "SYSTEM",
          type: "SYSTEM",
          body: "แจ้งผู้ประมูล: รอบประมูลถูกยกเลิก",
          idempotencyKey: `auction.round_cancelled:${roundId}:${aucBuyer1Id}`,
          payload: { event: "auction.round_cancelled", roundId },
        });
      assert.equal(buyer1MsgRes.status, 201);

      const sellerToken = signAccessToken({ sub: aucSellerId, role: "SELLER" });
      const buyer1Token = signAccessToken({ sub: aucBuyer1Id, role: "BUYER" });
      const buyer2Token = signAccessToken({ sub: aucBuyer2Id, role: "BUYER" });

      // Verify display name "ระบบฝ่ายการตลาด" and isolation on GET /conversations
      const sellerListRes = await request(app)
        .get("/conversations")
        .set("Authorization", `Bearer ${sellerToken}`);
      assert.equal(sellerListRes.status, 200);
      const sellerRoom = sellerListRes.body.items.find(
        (c) => c.id === sellerConvRes.body.id,
      );
      assert.ok(sellerRoom, "Seller must see their own AUCTION room");
      assert.equal(sellerRoom.participants.length, 2);
      const sysParticipant = sellerRoom.participants.find(
        (p) => p.userId === "system-marketing",
      );
      assert.equal(sysParticipant?.displayName, "ระบบฝ่ายการตลาด");
      assert.equal(
        sellerListRes.body.items.some((c) => c.id === buyer1ConvRes.body.id),
        false,
        "Seller must NOT see Buyer 1's AUCTION room",
      );

      // Verify Buyer 1 cannot read Seller's room and non-participant Buyer 2 cannot read either
      const crossReadRes = await request(app)
        .get(`/conversations/${sellerConvRes.body.id}/messages`)
        .set("Authorization", `Bearer ${buyer1Token}`);
      assert.equal(crossReadRes.status, 403);

      const outsiderReadRes = await request(app)
        .get(`/conversations/${buyer1ConvRes.body.id}/messages`)
        .set("Authorization", `Bearer ${buyer2Token}`);
      assert.equal(outsiderReadRes.status, 403);

      // Read-only enforcement: User cannot reply (POST /conversations/:id/messages -> 403)
      const replyRes = await request(app)
        .post(`/conversations/${sellerConvRes.body.id}/messages`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ body: "พยายามตอบกลับห้องระบบ" });
      assert.equal(replyRes.status, 403);

      const buyerReplyRes = await request(app)
        .post(`/conversations/${buyer1ConvRes.body.id}/messages`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ body: "ผู้ซื้อพยายามตอบกลับห้องระบบ" });
      assert.equal(buyerReplyRes.status, 403);

      // Read-only enforcement: User cannot upload attachment (POST /conversations/:id/attachments -> 403)
      const attachRes = await request(app)
        .post(`/conversations/${sellerConvRes.body.id}/attachments`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .attach("file", Buffer.from("fake-image-bytes"), {
          filename: "test.png",
          contentType: "image/png",
        });
      assert.equal(attachRes.status, 403);
    },
  );

  await t.test(
    "AUCTION atomic DB idempotency: concurrent requests with identical idempotencyKey create exactly 1 Message in MongoDB",
    async () => {
      const roundId = `int-conc-round-${Date.now()}`;
      const targetUserId = `int-conc-user-${Date.now()}`;

      const convRes = await request(app)
        .post("/internal/conversations")
        .set("x-internal-token", TOKEN)
        .send({
          contextType: "AUCTION",
          contextId: `${roundId}:${targetUserId}`,
          createdBy: "system-marketing",
          participants: [
            { userId: targetUserId, role: "SELLER" },
            { userId: "system-marketing", role: "SYSTEM" },
          ],
        });
      assert.equal(convRes.status, 201);
      const convId = convRes.body.id;
      const sharedKey = `auction.item_cancelled:item-${Date.now()}:${targetUserId}`;

      // Fire 5 concurrent requests with the exact same idempotencyKey against MongoDB
      const concurrentResults = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .post(`/internal/conversations/${convId}/messages`)
            .set("x-internal-token", TOKEN)
            .send({
              senderId: "system-marketing",
              senderRole: "SYSTEM",
              type: "SYSTEM",
              body: "ข้อความทดสอบ Concurrent Idempotency",
              idempotencyKey: sharedKey,
              payload: { event: "auction.item_cancelled" },
            }),
        ),
      );

      for (const r of concurrentResults) {
        assert.ok(
          [200, 201].includes(r.status),
          `Expected 200 or 201 but got ${r.status}: ${JSON.stringify(r.body)}`,
        );
      }

      const distinctMsgIds = [
        ...new Set(concurrentResults.map((r) => r.body.id)),
      ];
      assert.equal(
        distinctMsgIds.length,
        1,
        "All concurrent requests must resolve to the exact same Message ID",
      );

      const dbMessages = await prisma.message.findMany({
        where: { conversationId: convId, idempotencyKey: sharedKey },
      });
      assert.equal(
        dbMessages.length,
        1,
        "MongoDB must contain exactly 1 Message document for the idempotencyKey",
      );
    },
  );

  await t.test(
    "Cross-service chatClient notification partial failure + retry delivers only missing recipient without duplicating delivered messages",
    async () => {
      const http = require("node:http");
      const server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;

      const prevChatUrl = process.env.CHAT_SERVICE_URL;
      process.env.CHAT_SERVICE_URL = baseUrl;

      // Clear cached chatClient module so it picks up CHAT_SERVICE_URL
      const chatClientPath =
        require.resolve("../../product-service/src/features/auctions/chatClient");
      delete require.cache[chatClientPath];
      const chatClient = require(chatClientPath);

      const roundId = `int-partial-round-${Date.now()}`;
      const sellerUser = `int-partial-seller-${Date.now()}`;
      const bidder1User = `int-partial-bidder1-${Date.now()}`;
      const bidder2User = `int-partial-bidder2-${Date.now()}`;

      const origFetch = global.fetch;
      let failBidder2Once = true;
      global.fetch = async (url, opts) => {
        if (
          failBidder2Once &&
          typeof url === "string" &&
          url.includes("/messages") &&
          opts?.body
        ) {
          const parsed = JSON.parse(opts.body);
          if (
            parsed.idempotencyKey &&
            parsed.idempotencyKey.endsWith(`:${bidder2User}`)
          ) {
            failBidder2Once = false;
            return {
              ok: false,
              status: 503,
              text: async () => "Simulated transient failure for bidder 2",
            };
          }
        }
        return origFetch(url, opts);
      };

      try {
        const roundObj = {
          id: roundId,
          title: "รอบทดสอบ Cross-Service Retry",
          cancellationReason: "เหตุขัดข้องทางระบบ",
        };

        // 1st attempt: sellerUser and bidder1User succeed, bidder2User fails
        const attempt1 = await chatClient.notifyRoundCancelled({
          round: roundObj,
          sellerIds: [sellerUser],
          bidderIds: [bidder1User, bidder2User],
        });
        assert.equal(attempt1.deliveredCount, 2);
        assert.equal(attempt1.failedCount, 1);
        assert.equal(attempt1.warnings.length, 1);

        // 2nd attempt (retry): all 3 succeed; sellerUser and bidder1User are deduplicated (200 OK), bidder2User is created (201)
        const attempt2 = await chatClient.notifyRoundCancelled({
          round: roundObj,
          sellerIds: [sellerUser],
          bidderIds: [bidder1User, bidder2User],
        });
        assert.equal(attempt2.deliveredCount, 3);
        assert.equal(attempt2.failedCount, 0);
        assert.equal(attempt2.warnings.length, 0);

        // Verify in MongoDB that each of the 3 recipients has exactly 1 conversation and 1 message
        for (const uid of [sellerUser, bidder1User, bidder2User]) {
          const conv = await prisma.conversation.findUnique({
            where: { contextKey: `AUCTION:${roundId}:${uid}` },
          });
          assert.ok(conv, `Conversation must exist for ${uid}`);
          assert.equal(conv.participants.length, 2);

          const msgs = await prisma.message.findMany({
            where: { conversationId: conv.id },
          });
          assert.equal(
            msgs.length,
            1,
            `Recipient ${uid} must have exactly 1 message after retry (got ${msgs.length})`,
          );
        }
      } finally {
        global.fetch = origFetch;
        if (prevChatUrl === undefined) {
          delete process.env.CHAT_SERVICE_URL;
        } else {
          process.env.CHAT_SERVICE_URL = prevChatUrl;
        }
        delete require.cache[chatClientPath];
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
});

// Runs once after every test in this file, whether they passed, failed or
// skipped — the limiter's Redis connection is opened lazily on the first
// limited request and would otherwise hold the process open.
after(async () => {
  await closeRateLimitClient();
});
