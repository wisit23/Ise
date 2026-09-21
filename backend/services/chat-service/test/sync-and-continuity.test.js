const test = require("node:test");
const assert = require("node:assert/strict");

process.env.INTERNAL_SERVICE_TOKEN = "test-internal-token";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const {
  calculateBackoffMs,
  deliverMessage,
  startSupportSyncWorker,
  stopSupportSyncWorker,
} = require("../src/features/sync/supportSyncWorker");
const { buildPageQuery } = require("../src/features/messages/cursor");
const broadcast = require("../src/realtime/broadcast");
const prisma = require("../src/models/prismaClient");

test("supportSyncWorker exponential backoff and bounded lifecycle", async (t) => {
  await t.test(
    "calculateBackoffMs produces exponential backoff with upper bound",
    () => {
      assert.equal(calculateBackoffMs(1), 1000);
      assert.equal(calculateBackoffMs(2), 2000);
      assert.equal(calculateBackoffMs(3), 4000);
      assert.equal(calculateBackoffMs(4), 8000);
      assert.equal(calculateBackoffMs(7), 60000); // capped at 60s
      assert.equal(calculateBackoffMs(20), 60000);
    },
  );

  await t.test(
    "startSupportSyncWorker and stopSupportSyncWorker are bounded and cleanly stop",
    () => {
      startSupportSyncWorker(100);
      // Should not throw or crash on repeated calls
      startSupportSyncWorker(100);
      stopSupportSyncWorker();
      stopSupportSyncWorker();
    },
  );
});

test("Chat-to-ticket sync handles outages without losing persisted messages", async (t) => {
  const convId = "conv-support-1";
  const msgId = "msg-sync-test-1";

  const fakeConversation = {
    id: convId,
    contextType: "SUPPORT",
    contextId: "ticket-sync-1",
  };

  const fakeMessage = {
    id: msgId,
    conversationId: convId,
    senderId: "buyer-1",
    senderRole: "BUYER",
    type: "TEXT",
    body: "Can you help with my order?",
    payload: null,
    visibility: "ALL",
    syncStatus: "PENDING",
    syncAttempts: 0,
    createdAt: new Date(),
  };

  const originalUpdate = prisma.message.update;
  let updatedData = null;

  prisma.message.update = async ({ data }) => {
    updatedData = data;
    Object.assign(fakeMessage, data);
    return fakeMessage;
  };

  t.after(() => {
    prisma.message.update = originalUpdate;
  });

  // Mock global fetch to simulate support-service outage
  const originalFetch = global.fetch;

  await t.test(
    "service outage records retry backoff without losing message",
    async () => {
      global.fetch = async () => {
        throw new Error("ECONNREFUSED: support-service unreachable");
      };

      const ok = await deliverMessage(fakeConversation, fakeMessage);
      assert.equal(ok, false);
      assert.equal(updatedData.syncStatus, "PENDING");
      assert.equal(updatedData.syncAttempts, 1);
      assert.ok(updatedData.nextRetryAt > new Date());
      assert.match(updatedData.lastSyncError, /ECONNREFUSED/);
      assert.equal(
        fakeMessage.body,
        "Can you help with my order?",
        "Message body preserved",
      );
    },
  );

  await t.test("successful delivery marks syncStatus: SYNCED", async () => {
    global.fetch = async () => {
      return {
        ok: true,
        status: 201,
        json: async () => ({ success: true }),
      };
    };

    const ok = await deliverMessage(fakeConversation, fakeMessage);
    assert.equal(ok, true);
    assert.equal(updatedData.syncStatus, "SYNCED");
    assert.ok(updatedData.syncedAt);
    assert.equal(updatedData.lastSyncError, null);
  });

  global.fetch = originalFetch;
});

test("Internal notes privacy and query boundaries", async (t) => {
  await t.test("buildPageQuery excludes internal notes by default", () => {
    const query = buildPageQuery({
      conversationId: "conv-1",
      limit: 20,
      includeInternal: false,
    });
    assert.deepEqual(query.where.visibility, { not: "INTERNAL" });
  });

  await t.test(
    "buildPageQuery allows internal notes when includeInternal is true",
    () => {
      const query = buildPageQuery({
        conversationId: "conv-1",
        limit: 20,
        includeInternal: true,
      });
      assert.equal(query.where.visibility, undefined);
    },
  );

  await t.test(
    "broadcastMessage does not emit internal notes to public conversation room",
    () => {
      let emittedRooms = [];
      const fakeIo = {
        to: (room) => {
          emittedRooms.push(room);
          return {
            emit: () => {},
          };
        },
      };

      broadcast.setIo(fakeIo);

      const conv = {
        id: "conv-privacy-1",
        participants: [
          { userId: "buyer-1", role: "BUYER" },
          { userId: "agent-1", role: "AGENT" },
        ],
      };

      const internalMsg = {
        id: "m-priv-1",
        body: "Internal staff note",
        visibility: "INTERNAL",
      };

      broadcast.broadcastMessage(conv, internalMsg);

      // Must NOT contain conversation:conv-privacy-1
      assert.equal(
        emittedRooms.includes("conversation:conv-privacy-1"),
        false,
        "Internal note must never be broadcast to public conversation room",
      );
      // Must NOT emit to buyer-1's personal room
      assert.equal(
        emittedRooms.includes("user:buyer-1"),
        false,
        "Internal note must not be sent to buyer",
      );
      // Should emit to agent-1's personal room
      assert.equal(
        emittedRooms.includes("user:agent-1"),
        true,
        "Internal note should be sent to agent",
      );

      broadcast.setIo(null);
    },
  );
});
