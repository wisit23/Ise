const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const { getTranscript } = require("./internalController");

test("getTranscript excludes internal notes from public transcript by default", async () => {
  const origFindById = prisma.conversation.findUnique;
  const origFindMany = prisma.message.findMany;

  let capturedWhere = null;

  prisma.conversation.findUnique = () => {
    return Promise.resolve({ id: "conv-1", contextType: "SUPPORT" });
  };
  prisma.message.findMany = (args) => {
    capturedWhere = args.where;
    return Promise.resolve([
      { id: "msg-1", body: "Customer visible", visibility: "ALL" },
    ]);
  };

  const req = {
    params: { id: "conv-1" },
    query: {},
  };
  let sentJson = null;
  const res = {
    json: (data) => {
      sentJson = data;
    },
  };
  let errorCaught = null;
  const next = (err) => {
    errorCaught = err;
  };

  try {
    await getTranscript(req, res, next);
    assert.equal(errorCaught, null);
    assert.ok(capturedWhere);
    assert.deepEqual(capturedWhere.visibility, { not: "INTERNAL" });
    assert.equal(capturedWhere.deletedAt, null);
    assert.equal(sentJson.messages.length, 1);
  } finally {
    prisma.conversation.findUnique = origFindById;
    prisma.message.findMany = origFindMany;
  }
});

test("getTranscript includes internal notes when includeInternal is true", async () => {
  const origFindById = prisma.conversation.findUnique;
  const origFindMany = prisma.message.findMany;

  let capturedWhere = null;

  prisma.conversation.findUnique = () => {
    return Promise.resolve({ id: "conv-1", contextType: "SUPPORT" });
  };
  prisma.message.findMany = (args) => {
    capturedWhere = args.where;
    return Promise.resolve([
      { id: "msg-1", body: "Customer visible", visibility: "ALL" },
      { id: "msg-2", body: "Internal note", visibility: "INTERNAL" },
    ]);
  };

  const req = {
    params: { id: "conv-1" },
    query: { includeInternal: "true" },
  };
  let sentJson = null;
  const res = {
    json: (data) => {
      sentJson = data;
    },
  };
  let errorCaught = null;
  const next = (err) => {
    errorCaught = err;
  };

  try {
    await getTranscript(req, res, next);
    assert.equal(errorCaught, null);
    assert.ok(capturedWhere);
    assert.equal(capturedWhere.visibility, undefined);
    assert.equal(capturedWhere.deletedAt, null);
    assert.equal(sentJson.messages.length, 2);
  } finally {
    prisma.conversation.findUnique = origFindById;
    prisma.message.findMany = origFindMany;
  }
});

test("sendMessage deduplicates retry and concurrent requests via atomic DB idempotencyKey uniqueness", async (t) => {
  const { sendMessage } = require("./internalController");
  const conversationModel = require("../conversations/conversationModel");
  const messageModel = require("../messages/messageModel");
  const broadcast = require("../../realtime/broadcast");

  t.mock.method(conversationModel, "findById", async () => ({
    id: "conv-auction-1",
    contextType: "AUCTION",
    participants: [
      { userId: "seller-1", role: "SELLER" },
      { userId: "system-marketing", role: "SYSTEM" },
    ],
  }));

  const storedByKey = new Map();
  let createCalls = 0;
  let broadcastCalls = 0;

  t.mock.method(messageModel, "createAndTouch", async (data) => {
    createCalls++;
    if (data.idempotencyKey && storedByKey.has(data.idempotencyKey)) {
      const err = new Error(
        "Unique constraint failed on the constraint: `Message_idempotencyKey_key`",
      );
      err.code = "P2002";
      throw err;
    }
    const created = { id: `msg-${createCalls}`, ...data };
    if (data.idempotencyKey) {
      storedByKey.set(data.idempotencyKey, created);
    }
    return created;
  });

  t.mock.method(messageModel, "findByIdempotencyKey", async (_convId, key) => {
    return storedByKey.get(key) || null;
  });

  t.mock.method(broadcast, "broadcastMessage", () => {
    broadcastCalls++;
  });

  const makeReq = () => ({
    params: { id: "conv-auction-1" },
    body: {
      senderId: "system-marketing",
      senderRole: "SYSTEM",
      type: "SYSTEM",
      body: "รายการประมูลถูกยกเลิก",
      idempotencyKey: "auction.item_cancelled:item-1:seller-1",
      payload: { event: "auction.item_cancelled" },
    },
  });

  // Run two concurrent requests with the exact same idempotencyKey
  const responses = [];
  await Promise.all(
    [0, 1].map((idx) =>
      sendMessage(
        makeReq(),
        {
          status: (code) => ({
            json: (data) => {
              responses[idx] = { status: code, body: data };
            },
          }),
        },
        (err) => {
          throw err;
        },
      ),
    ),
  );

  assert.equal(storedByKey.size, 1, "Only 1 message stored in DB");
  assert.equal(
    broadcastCalls,
    1,
    "Broadcast only once for the created message",
  );
  const statuses = responses.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 201]);
  assert.equal(responses[0].body.id, "msg-1");
  assert.equal(responses[1].body.id, "msg-1");
  assert.equal(
    responses[0].body.idempotencyKey,
    "auction.item_cancelled:item-1:seller-1",
  );
});

test("conversationService.withDisplayNames resolves 'ระบบฝ่ายการตลาด' for AUCTION system participant", async (t) => {
  const conversationService = require("../conversations/conversationService");
  const authClient = require("../../services/authClient");

  t.mock.method(
    authClient,
    "getDisplayNames",
    async () => new Map([["seller-1", "ร้านค้าวินเทจ"]]),
  );

  const enriched = await conversationService.withDisplayNames([
    {
      id: "conv-auction-1",
      contextType: "AUCTION",
      contextId: "round-1:seller-1",
      participants: [
        { userId: "seller-1", role: "SELLER" },
        { userId: "system-marketing", role: "SYSTEM" },
      ],
    },
  ]);

  const sellerParticipant = enriched[0].participants.find(
    (p) => p.userId === "seller-1",
  );
  const systemParticipant = enriched[0].participants.find(
    (p) => p.userId === "system-marketing",
  );

  assert.equal(sellerParticipant.displayName, "ร้านค้าวินเทจ");
  assert.equal(systemParticipant.displayName, "ระบบฝ่ายการตลาด");
});

test("messageService.sendMessage rejects user replies in read-only AUCTION conversations with 403", async (t) => {
  const messageService = require("../messages/messageService");
  const conversationService = require("../conversations/conversationService");

  t.mock.method(conversationService, "getForParticipant", async () => ({
    id: "conv-auction-1",
    contextType: "AUCTION",
    status: "ACTIVE",
    participants: [
      { userId: "seller-1", role: "SELLER" },
      { userId: "system-marketing", role: "SYSTEM" },
    ],
  }));

  await assert.rejects(
    messageService.sendMessage("conv-auction-1", "seller-1", "ขอสอบถามครับ"),
    (err) => err.status === 403 && err.message.includes("อ่านอย่างเดียว"),
  );
});
