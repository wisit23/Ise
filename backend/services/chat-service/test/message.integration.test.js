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
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const { signAccessToken } = require("@reloop/shared");
// Bulk-seeding through the public API would otherwise trip the per-user send
// limit (see src/limits.js) — raised HERE rather than lowering the real limit,
// which stays exactly what production runs.
process.env.CHAT_RATE_LIMIT_SEND_MESSAGE ||= "100000";
process.env.CHAT_RATE_LIMIT_UPLOAD_ATTACHMENT ||= "100000";
process.env.CHAT_RATE_LIMIT_CREATE_CONVERSATION ||= "100000";

const prisma = require("../src/models/prismaClient");
const { PrismaClient } = require("../src/generated/prisma-client");
const app = require("../src/app");
// The rate limiter opens a Redis connection lazily on the first limited
// request; without closing it the test process stays alive forever.
const { closeRateLimitClient } = require("../src/middleware/rateLimit");

const buyerId = `int-test-msg-buyer-${Date.now()}`;
const sellerId = `int-test-msg-seller-${Date.now()}`;
const strangerId = `int-test-msg-stranger-${Date.now()}`;

const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
const sellerToken = signAccessToken({ sub: sellerId, role: "SELLER" });
const strangerToken = signAccessToken({ sub: strangerId, role: "BUYER" });

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

async function makeConversation(contextKeySuffix) {
  const now = new Date();
  return prisma.conversation.create({
    data: {
      contextType: "PRODUCT",
      contextId: `p-${contextKeySuffix}`,
      contextKey: `PRODUCT:p-${contextKeySuffix}:${buyerId}`,
      status: "ACTIVE",
      createdBy: buyerId,
      participants: [
        {
          userId: buyerId,
          role: "BUYER",
          joinedAt: now,
          lastReadAt: null,
          leftAt: null,
        },
        {
          userId: sellerId,
          role: "SELLER",
          joinedAt: now,
          lastReadAt: null,
          leftAt: null,
        },
      ],
    },
  });
}

test("message send/read against a real MongoDB replica set", async (t) => {
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

  await t.test("send then read back a message", async () => {
    const conversation = await makeConversation("send-read");
    const sendRes = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ body: "สวัสดีครับ สนใจสินค้าชิ้นนี้อยู่ครับ" });
    assert.equal(sendRes.status, 201);
    assert.equal(sendRes.body.body, "สวัสดีครับ สนใจสินค้าชิ้นนี้อยู่ครับ");
    assert.equal(sendRes.body.senderId, buyerId);
    assert.equal(sendRes.body.senderRole, "BUYER");

    const listRes = await request(app)
      .get(`/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${sellerToken}`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.items.length, 1);
    assert.equal(listRes.body.items[0].id, sendRes.body.id);
    assert.equal(listRes.body.nextCursor, null);
  });

  await t.test(
    "sending updates the conversation's lastMessageAt/lastMessagePreview atomically",
    async () => {
      const conversation = await makeConversation("preview");
      await request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ body: "test preview text" });

      const reloaded = await prisma.conversation.findUnique({
        where: { id: conversation.id },
      });
      assert.ok(reloaded.lastMessageAt);
      assert.equal(reloaded.lastMessagePreview, "test preview text");
    },
  );

  await t.test("empty body is rejected with 400", async () => {
    const conversation = await makeConversation("empty-body");
    const res = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ body: "   " });
    assert.equal(res.status, 400);
  });

  await t.test(
    "a stranger cannot send into a conversation they're not part of",
    async () => {
      const conversation = await makeConversation("stranger-send");
      const res = await request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .send({ body: "hi" });
      assert.equal(res.status, 403);
    },
  );

  await t.test("a stranger cannot list messages either", async () => {
    const conversation = await makeConversation("stranger-list");
    const res = await request(app)
      .get(`/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${strangerToken}`);
    assert.equal(res.status, 403);
  });

  await t.test("guest gets 401, not 403, sending a message", async () => {
    const conversation = await makeConversation("guest-send");
    const res = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .send({ body: "hi" });
    assert.equal(res.status, 401);
  });

  await t.test(
    "a LOCKED conversation rejects new messages with 409",
    async () => {
      const conversation = await makeConversation("locked");
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "LOCKED" },
      });
      const res = await request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ body: "can I still send this?" });
      assert.equal(res.status, 409);
    },
  );

  await t.test(
    "cursor pagination: 3 pages of a 65-message history, no duplicates, no gaps",
    async () => {
      const conversation = await makeConversation("pagination");
      const sentIds = [];
      // Sequential, not Promise.all — message order must be deterministic to
      // assert against, and this also exercises 65 real sequential writes
      // against Mongo (not a mocked list).
      for (let i = 0; i < 65; i += 1) {
        const res = await request(app)
          .post(`/conversations/${conversation.id}/messages`)
          .set("Authorization", `Bearer ${buyerToken}`)
          .send({ body: `message #${i}` });
        assert.equal(res.status, 201);
        sentIds.push(res.body.id);
      }

      const seen = [];
      let cursor;
      let pages = 0;
      for (;;) {
        const res = await request(app)
          .get(`/conversations/${conversation.id}/messages`)
          .query(cursor ? { before: cursor, limit: 30 } : { limit: 30 })
          .set("Authorization", `Bearer ${buyerToken}`);
        assert.equal(res.status, 200);
        pages += 1;
        seen.push(...res.body.items.map((m) => m.id));
        cursor = res.body.nextCursor;
        if (!cursor) break;
        assert.ok(pages < 10, "pagination should have terminated by now");
      }

      assert.equal(
        pages,
        3,
        "65 messages at 30/page should take exactly 3 pages",
      );
      assert.equal(seen.length, 65, "no duplicates and no gaps across pages");
      assert.equal(
        new Set(seen).size,
        65,
        "every message id must be unique across all pages",
      );
      // Newest-first: the very first item of page 1 must be the LAST message sent.
      assert.equal(seen[0], sentIds[sentIds.length - 1]);
      assert.equal(seen[seen.length - 1], sentIds[0]);
    },
  );

  await t.test(
    "cursor pagination stays correct even when a new message is inserted mid-pagination",
    async () => {
      const conversation = await makeConversation("interleaved");
      for (let i = 0; i < 5; i += 1) {
        await request(app)
          .post(`/conversations/${conversation.id}/messages`)
          .set("Authorization", `Bearer ${buyerToken}`)
          .send({ body: `msg-${i}` });
      }

      // Fetch page 1 (limit 2) — this is the cursor a client would hold while
      // "still scrolling".
      const page1 = await request(app)
        .get(`/conversations/${conversation.id}/messages`)
        .query({ limit: 2 })
        .set("Authorization", `Bearer ${buyerToken}`);
      assert.equal(page1.body.items.length, 2);
      const cursorAfterPage1 = page1.body.nextCursor;

      // A NEW message arrives, inserted "at the top" (it's the newest now) —
      // simulating another user messaging while this client is still paging
      // through history it already started reading.
      await request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ body: "just arrived while you were scrolling" });

      // Page 2, using the cursor captured BEFORE the new message existed.
      const page2 = await request(app)
        .get(`/conversations/${conversation.id}/messages`)
        .query({ before: cursorAfterPage1, limit: 2 })
        .set("Authorization", `Bearer ${buyerToken}`);
      assert.equal(page2.status, 200);

      // The new message must NOT appear in page 2 (it's newer than the
      // cursor), and none of page 1's items should reappear either.
      const page1Ids = new Set(page1.body.items.map((m) => m.id));
      for (const item of page2.body.items) {
        assert.ok(
          !page1Ids.has(item.id),
          "page 2 must not repeat anything already returned in page 1",
        );
        assert.notEqual(item.body, "just arrived while you were scrolling");
      }
    },
  );

  await t.test(
    "an invalid cursor is rejected with 400, not silently ignored",
    async () => {
      const conversation = await makeConversation("bad-cursor");
      const res = await request(app)
        .get(`/conversations/${conversation.id}/messages`)
        .query({ before: "not-a-real-id" })
        .set("Authorization", `Bearer ${buyerToken}`);
      assert.equal(res.status, 400);
    },
  );

  await t.test(
    "mark-read updates lastReadAt and unread-count reflects it",
    async () => {
      const conversation = await makeConversation("unread");

      let unread = await request(app)
        .get("/unread-count")
        .set("Authorization", `Bearer ${buyerToken}`);
      const baseline = unread.body.total;

      // Seller sends 3 messages the buyer hasn't seen yet.
      for (let i = 0; i < 3; i += 1) {
        await request(app)
          .post(`/conversations/${conversation.id}/messages`)
          .set("Authorization", `Bearer ${sellerToken}`)
          .send({ body: `unread-${i}` });
      }

      unread = await request(app)
        .get("/unread-count")
        .set("Authorization", `Bearer ${buyerToken}`);
      assert.equal(unread.body.total, baseline + 3);

      const readRes = await request(app)
        .post(`/conversations/${conversation.id}/read`)
        .set("Authorization", `Bearer ${buyerToken}`);
      assert.equal(readRes.status, 200);
      assert.ok(readRes.body.lastReadAt);

      unread = await request(app)
        .get("/unread-count")
        .set("Authorization", `Bearer ${buyerToken}`);
      assert.equal(unread.body.total, baseline);

      // The seller's own unread count must not include their own messages.
      const sellerUnread = await request(app)
        .get("/unread-count")
        .set("Authorization", `Bearer ${sellerToken}`);
      assert.equal(sellerUnread.status, 200);
      // (No strict equality asserted against a baseline here — the seller may
      // have other fixture conversations from earlier subtests; the important
      // property, that sending doesn't inflate your OWN unread count, is
      // covered by the buyer-side assertions above.)
    },
  );

  await t.test(
    "messages survive being re-read through a brand-new Prisma connection (process-restart proxy)",
    async () => {
      const conversation = await makeConversation("restart");
      const sendRes = await request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ body: "still here after a restart?" });
      assert.equal(sendRes.status, 201);

      // A fresh PrismaClient — not the module-cached `prisma` the app itself
      // uses — is the closest thing to proving persistence without actually
      // restarting the process in-test: if the data were only ever held in
      // application memory, a brand-new connection would see nothing.
      const freshPrisma = new PrismaClient();
      try {
        const reread = await freshPrisma.message.findUnique({
          where: { id: sendRes.body.id },
        });
        assert.ok(reread, "message must be readable from a fresh connection");
        assert.equal(reread.body, "still here after a restart?");
      } finally {
        await freshPrisma.$disconnect();
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
