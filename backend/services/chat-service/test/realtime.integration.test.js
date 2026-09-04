// Integration test against a real, disposable MongoDB replica set AND a
// real Redis instance (needed for the @socket.io/redis-adapter — see
// docker-compose.yml's `redis` service, already required since CHAT-001).
// Skips cleanly when either is unreachable so `npm test` still passes on a
// machine with neither running; REQUIRE_INTEGRATION=1 (the CI workflow
// does) turns that skip into a hard failure instead — same pattern as
// every other *.integration.test.js in this service.
//
// Unlike the REST integration tests, this spins up a REAL http.Server +
// Socket.IO server in-process (server.listen(0), an ephemeral port) and
// connects real socket.io-client sockets to it — bypassing the gateway
// entirely, since the gateway's WebSocket-proxy path-rewriting quirk (see
// socketServer.js's comment) is infra wiring this test can't exercise from
// inside a single Node process. That specific path is verified separately,
// live, against the real Docker Compose stack (see chat/progress.md).
const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const request = require("supertest");
const { io: ioClient } = require("socket.io-client");

if (process.env.DATABASE_URL_CHAT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_CHAT;
}
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";

const { signAccessToken } = require("@reloop/shared");
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
const { createSocketServer } = require("../src/realtime/socketServer");

const buyerId = `int-test-rt-buyer-${Date.now()}`;
const sellerId = `int-test-rt-seller-${Date.now()}`;
const strangerId = `int-test-rt-stranger-${Date.now()}`;
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

async function redisIsReachable() {
  const IORedis = require("ioredis");
  const redis = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
    lazyConnect: true,
    connectTimeout: 1500,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.ping();
    return true;
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}

function makeConversation(suffix) {
  const now = new Date();
  return prisma.conversation.create({
    data: {
      contextType: "PRODUCT",
      contextId: `p-rt-${suffix}`,
      contextKey: `PRODUCT:p-rt-${suffix}:${buyerId}`,
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

function connectClient(port, token) {
  return ioClient(`http://localhost:${port}`, {
    path: "/api/chat/socket.io",
    transports: ["websocket"],
    auth: { token },
    reconnection: false,
    forceNew: true,
  });
}

function waitForEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function joinAndAck(socket, conversationId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("join ack timed out")),
      3000,
    );
    socket.emit("join", conversationId, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

test("Socket.IO realtime layer against a real MongoDB replica set + Redis", async (t) => {
  const dbOk = await databaseIsReachable();
  const redisOk = dbOk && (await redisIsReachable());
  if (!dbOk || !redisOk) {
    const message = !dbOk
      ? "DATABASE_URL_CHAT not set or MongoDB unreachable — see docs/featureplan/chat/plan.md CHAT-001"
      : "REDIS_URL not set or Redis unreachable — required for @socket.io/redis-adapter (CHAT-006)";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const server = http.createServer(app);
  const { close: closeSocketServer } = createSocketServer(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const openSockets = [];
  t.after(async () => {
    for (const s of openSockets) s.close();
    // socket.close() on the client doesn't wait for the server's own
    // "disconnect" handler (which itself awaits presence.clearOnline) to
    // finish — closing presence's Redis client immediately after racing
    // that handler produced a real "Connection is closed" unhandled
    // rejection on a slower run. A short grace period lets in-flight
    // disconnect handlers settle before anything Redis-backed is torn down.
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Order matters: close the Socket.IO/Redis-adapter layer before the
    // plain http server, and close presence.js's separate Redis client
    // too — otherwise open Redis connections keep the test process alive
    // past every assertion having already finished (see socketServer.js's
    // comment on why close() exists at all).
    await closeSocketServer();
    await require("../src/realtime/presence").disconnect();
    await new Promise((resolve) => server.close(resolve));
  });

  await t.test("connecting with no token is rejected", async () => {
    const socket = connectClient(port, undefined);
    openSockets.push(socket);
    const err = await waitForEvent(socket, "connect_error");
    assert.equal(err.message, "Unauthorized");
  });

  await t.test("connecting with an invalid token is rejected", async () => {
    const socket = connectClient(port, "not-a-real-token");
    openSockets.push(socket);
    const err = await waitForEvent(socket, "connect_error");
    assert.equal(err.message, "Unauthorized");
  });

  await t.test("connecting with a valid token succeeds", async () => {
    const socket = connectClient(port, buyerToken);
    openSockets.push(socket);
    await waitForEvent(socket, "connect");
    assert.equal(socket.connected, true);
    socket.close();
  });

  await t.test(
    "joining a conversation you're not part of is rejected, even with a valid token",
    async () => {
      const conversation = await makeConversation("join-forbidden");
      const socket = connectClient(port, strangerToken);
      openSockets.push(socket);
      await waitForEvent(socket, "connect");
      const ack = await joinAndAck(socket, conversation.id);
      assert.equal(ack.error, "forbidden");
      socket.close();
    },
  );

  await t.test("a real participant can join", async () => {
    const conversation = await makeConversation("join-ok");
    const socket = connectClient(port, buyerToken);
    openSockets.push(socket);
    await waitForEvent(socket, "connect");
    const ack = await joinAndAck(socket, conversation.id);
    assert.equal(ack.ok, true);
    socket.close();
  });

  await t.test(
    "a message sent via REST is delivered live to a joined socket (write-then-broadcast)",
    async () => {
      const conversation = await makeConversation("live-message");

      const buyerSocket = connectClient(port, buyerToken);
      const sellerSocket = connectClient(port, sellerToken);
      openSockets.push(buyerSocket, sellerSocket);
      await Promise.all([
        waitForEvent(buyerSocket, "connect"),
        waitForEvent(sellerSocket, "connect"),
      ]);
      await Promise.all([
        joinAndAck(buyerSocket, conversation.id),
        joinAndAck(sellerSocket, conversation.id),
      ]);

      const deliveredToSeller = waitForEvent(sellerSocket, "message:new");

      const sendRes = await request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ body: "ยังพร้อมขายอยู่ไหมครับ ผ่าน realtime นะ" });
      assert.equal(sendRes.status, 201);

      const delivered = await deliveredToSeller;
      assert.equal(delivered.id, sendRes.body.id);
      assert.equal(delivered.body, "ยังพร้อมขายอยู่ไหมครับ ผ่าน realtime นะ");

      buyerSocket.close();
      sellerSocket.close();
    },
  );

  await t.test(
    "an internal (SYSTEM) message is also delivered live",
    async () => {
      process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
      const conversation = await makeConversation("live-system");

      const buyerSocket = connectClient(port, buyerToken);
      openSockets.push(buyerSocket);
      await waitForEvent(buyerSocket, "connect");
      await joinAndAck(buyerSocket, conversation.id);

      const delivered = waitForEvent(buyerSocket, "message:new");
      const res = await request(app)
        .post(`/internal/conversations/${conversation.id}/messages`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({ senderId: "system", senderRole: "SYSTEM", body: "จัดส่งแล้ว" });
      assert.equal(res.status, 201);

      const payload = await delivered;
      assert.equal(payload.type, "SYSTEM");
      assert.equal(payload.body, "จัดส่งแล้ว");

      buyerSocket.close();
    },
  );

  await t.test(
    "typing:start/stop broadcasts to the other participant, not back to the sender",
    async () => {
      const conversation = await makeConversation("typing");
      const buyerSocket = connectClient(port, buyerToken);
      const sellerSocket = connectClient(port, sellerToken);
      openSockets.push(buyerSocket, sellerSocket);
      await Promise.all([
        waitForEvent(buyerSocket, "connect"),
        waitForEvent(sellerSocket, "connect"),
      ]);
      await Promise.all([
        joinAndAck(buyerSocket, conversation.id),
        joinAndAck(sellerSocket, conversation.id),
      ]);

      let buyerGotOwnTyping = false;
      buyerSocket.once("typing", () => {
        buyerGotOwnTyping = true;
      });

      const sellerTyping = waitForEvent(sellerSocket, "typing");
      buyerSocket.emit("typing:start", conversation.id);
      const startPayload = await sellerTyping;
      assert.equal(startPayload.userId, buyerId);
      assert.equal(startPayload.typing, true);

      const sellerTypingStop = waitForEvent(sellerSocket, "typing");
      buyerSocket.emit("typing:stop", conversation.id);
      const stopPayload = await sellerTypingStop;
      assert.equal(stopPayload.typing, false);

      assert.equal(
        buyerGotOwnTyping,
        false,
        "the sender must not receive their own typing broadcast",
      );

      buyerSocket.close();
      sellerSocket.close();
    },
  );

  await t.test(
    "typing events from a socket that never joined the room are ignored",
    async () => {
      const conversation = await makeConversation("typing-unjoined");
      const buyerSocket = connectClient(port, buyerToken);
      const sellerSocket = connectClient(port, sellerToken);
      openSockets.push(buyerSocket, sellerSocket);
      await Promise.all([
        waitForEvent(buyerSocket, "connect"),
        waitForEvent(sellerSocket, "connect"),
      ]);
      // Only the seller joins; the buyer emits typing without ever joining.
      await joinAndAck(sellerSocket, conversation.id);

      let sellerHeardTyping = false;
      sellerSocket.once("typing", () => {
        sellerHeardTyping = true;
      });
      buyerSocket.emit("typing:start", conversation.id);

      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(sellerHeardTyping, false);

      buyerSocket.close();
      sellerSocket.close();
    },
  );

  await t.test(
    "disconnecting broadcasts presence:offline to rooms the socket had joined",
    async () => {
      const conversation = await makeConversation("presence-disconnect");
      const buyerSocket = connectClient(port, buyerToken);
      const sellerSocket = connectClient(port, sellerToken);
      openSockets.push(buyerSocket, sellerSocket);
      await Promise.all([
        waitForEvent(buyerSocket, "connect"),
        waitForEvent(sellerSocket, "connect"),
      ]);
      await joinAndAck(sellerSocket, conversation.id);
      // The buyer joins AFTER the seller so the seller is guaranteed to
      // already be listening when the buyer later disconnects.
      await joinAndAck(buyerSocket, conversation.id);

      const offlineEvent = waitForEvent(sellerSocket, "presence");
      buyerSocket.close();

      const payload = await offlineEvent;
      assert.equal(payload.userId, buyerId);
      assert.equal(payload.online, false);

      sellerSocket.close();
    },
  );

  await t.test(
    "a participant who never joined the conversation still gets conversation:activity on their own user room",
    async () => {
      const conversation = await makeConversation("activity-no-join");
      // The seller connects but deliberately does NOT join the conversation
      // — this is the NavBar/inbox case: a user browsing anywhere else in
      // the app, with no chat room open at all.
      const sellerSocket = connectClient(port, sellerToken);
      openSockets.push(sellerSocket);
      await waitForEvent(sellerSocket, "connect");

      const activity = waitForEvent(sellerSocket, "conversation:activity");
      const sendRes = await request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ body: "ping while you were elsewhere" });
      assert.equal(sendRes.status, 201);

      const payload = await activity;
      assert.equal(payload.conversationId, conversation.id);
      assert.equal(payload.messageId, sendRes.body.id);
      assert.equal(payload.senderId, buyerId);
      // Deliberately NOT an unread count — the client re-reads that itself
      // (see broadcast.js's comment on why a server-computed total would
      // race the client's own mark-read calls).
      assert.equal(payload.total, undefined);

      sellerSocket.close();
    },
  );

  await t.test(
    "conversation:activity does not leak to a non-participant's user room",
    async () => {
      const conversation = await makeConversation("activity-stranger");
      const strangerSocket = connectClient(port, strangerToken);
      const sellerSocket = connectClient(port, sellerToken);
      openSockets.push(strangerSocket, sellerSocket);
      await Promise.all([
        waitForEvent(strangerSocket, "connect"),
        waitForEvent(sellerSocket, "connect"),
      ]);

      let strangerHeard = false;
      strangerSocket.once("conversation:activity", () => {
        strangerHeard = true;
      });
      // The seller IS a participant, so waiting on their event gives a
      // deterministic point at which the broadcast has definitely fanned
      // out — rather than an arbitrary sleep hoping the stranger "would
      // have" received it by now.
      const sellerActivity = waitForEvent(
        sellerSocket,
        "conversation:activity",
      );

      const sendRes = await request(app)
        .post(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ body: "participants only" });
      assert.equal(sendRes.status, 201);

      await sellerActivity;
      assert.equal(strangerHeard, false);

      strangerSocket.close();
      sellerSocket.close();
    },
  );

  await t.test(
    "an internal (SYSTEM) message also nudges every participant's user room",
    async () => {
      const conversation = await makeConversation("activity-internal");
      const sellerSocket = connectClient(port, sellerToken);
      openSockets.push(sellerSocket);
      await waitForEvent(sellerSocket, "connect");

      const activity = waitForEvent(sellerSocket, "conversation:activity");
      const sendRes = await request(app)
        .post(`/internal/conversations/${conversation.id}/messages`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN || "")
        .send({
          senderId: "system",
          senderRole: "SYSTEM",
          type: "SYSTEM",
          body: "คำสั่งซื้อเสร็จสมบูรณ์แล้ว",
        });
      assert.equal(sendRes.status, 201);

      const payload = await activity;
      assert.equal(payload.conversationId, conversation.id);
      assert.equal(payload.messageId, sendRes.body.id);

      sellerSocket.close();
    },
  );
});

// Runs once after every test in this file, whether they passed, failed or
// skipped — the limiter's Redis connection is opened lazily on the first
// limited request and would otherwise hold the process open.
after(async () => {
  await closeRateLimitClient();
});
