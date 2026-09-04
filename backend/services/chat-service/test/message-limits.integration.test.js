// Integration test for chat's usage limits (CHAT-007 Step 3 + message length)
// against a real MongoDB replica set. Skips cleanly when DATABASE_URL is
// unset/unreachable; REQUIRE_INTEGRATION=1 turns that skip into a failure.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

if (process.env.DATABASE_URL_CHAT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_CHAT;
}
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { MAX_MESSAGE_LENGTH } = require("../src/limits");
const { closeRateLimitClient } = require("../src/middleware/rateLimit");

const stamp = Date.now();
const buyerId = `int-test-lim-buyer-${stamp}`;
const sellerId = `int-test-lim-seller-${stamp}`;
const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

async function makeConversation(suffix) {
  const now = new Date();
  return prisma.conversation.create({
    data: {
      contextType: "PRODUCT",
      contextId: `p-${suffix}`,
      contextKey: `PRODUCT:p-${suffix}:${buyerId}`,
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

test("message length limit against a real MongoDB replica set", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL_CHAT not set or MongoDB unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const conversation = await makeConversation(`len-${stamp}`);
  t.after(async () => {
    await prisma.message.deleteMany({
      where: { conversationId: conversation.id },
    });
    await prisma.conversation.delete({ where: { id: conversation.id } });
    await closeRateLimitClient();
  });

  await t.test("a message exactly at the limit is accepted", async () => {
    const res = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ body: "ก".repeat(MAX_MESSAGE_LENGTH) });
    assert.equal(res.status, 201);
    assert.equal(res.body.body.length, MAX_MESSAGE_LENGTH);
  });

  await t.test("one character over the limit is refused with 400", async () => {
    const res = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ body: "ก".repeat(MAX_MESSAGE_LENGTH + 1) });
    // Before this limit existed a 30,000-character message returned 201 and
    // was stored — the express.json() 100 KB default was the only ceiling.
    assert.equal(res.status, 400);
  });

  await t.test(
    "an over-length message is not written to the database",
    async () => {
      const stored = await prisma.message.count({
        where: { conversationId: conversation.id },
      });
      assert.equal(stored, 1, "only the at-the-limit message should exist");
    },
  );

  await t.test("the Internal API can't bypass the limit either", async () => {
    // The check lives in createAndTouch precisely so service-to-service
    // callers are held to it too, not just browsers.
    const res = await request(app)
      .post(`/internal/conversations/${conversation.id}/messages`)
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({
        senderId: "system",
        senderRole: "SYSTEM",
        type: "SYSTEM",
        body: "x".repeat(MAX_MESSAGE_LENGTH + 1),
      });
    assert.equal(res.status, 400);
  });

  await t.test("an over-length attachment caption is refused too", async () => {
    const res = await request(app)
      .post(`/conversations/${conversation.id}/attachments`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .field("caption", "ก".repeat(MAX_MESSAGE_LENGTH + 1))
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "t.png",
        contentType: "image/png",
      });
    assert.equal(res.status, 400);
  });
});

async function redisIsReachable() {
  const IORedis = require("ioredis");
  const probe = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
    lazyConnect: true,
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

test("send rate limit against a real Redis", async (t) => {
  if (!(await databaseIsReachable()) || !(await redisIsReachable())) {
    const message = "MongoDB or Redis unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const { RATE_LIMITS } = require("../src/limits");
  const { limit } = RATE_LIMITS.sendMessage;

  // A user of its own, so the budget can't be spent by another test.
  const flooderId = `int-test-flood-${Date.now()}`;
  const flooderToken = signAccessToken({ sub: flooderId, role: "BUYER" });
  const now = new Date();
  const conversation = await prisma.conversation.create({
    data: {
      contextType: "PRODUCT",
      contextId: `p-flood-${Date.now()}`,
      contextKey: `PRODUCT:p-flood-${Date.now()}:${flooderId}`,
      status: "ACTIVE",
      createdBy: flooderId,
      participants: [
        {
          userId: flooderId,
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

  t.after(async () => {
    await prisma.message.deleteMany({
      where: { conversationId: conversation.id },
    });
    await prisma.conversation.delete({ where: { id: conversation.id } });
    await closeRateLimitClient();
  });

  const send = () =>
    request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${flooderToken}`)
      .send({ body: "flood" });

  await t.test("requests up to the limit all succeed", async () => {
    for (let i = 0; i < limit; i++) {
      const res = await send();
      assert.equal(res.status, 201, `request ${i + 1} of ${limit}`);
    }
  });

  await t.test(
    "the next request is refused with 429 + Retry-After",
    async () => {
      const res = await send();
      assert.equal(res.status, 429);
      assert.ok(
        res.headers["retry-after"],
        "must tell the client when to retry",
      );
    },
  );

  await t.test("the refused message was not stored", async () => {
    const stored = await prisma.message.count({
      where: { conversationId: conversation.id },
    });
    assert.equal(stored, limit);
  });

  await t.test("a different user is unaffected by that flood", async () => {
    const otherId = `int-test-calm-${Date.now()}`;
    const otherToken = signAccessToken({ sub: otherId, role: "BUYER" });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        participants: {
          push: {
            userId: otherId,
            role: "BUYER",
            joinedAt: new Date(),
            lastReadAt: null,
            leftAt: null,
          },
        },
      },
    });

    const res = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ body: "ผมไม่ได้สแปม" });
    assert.equal(res.status, 201, "one noisy user must not lock out others");
  });
});
