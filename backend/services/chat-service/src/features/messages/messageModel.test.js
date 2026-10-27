const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const { createAndTouch, countUnread } = require("./messageModel");

test.beforeEach((t) => {
  const original = prisma.inboxDismissal.deleteMany;
  prisma.inboxDismissal.deleteMany = t.mock.fn(async () => ({ count: 0 }));
  t.after(() => { prisma.inboxDismissal.deleteMany = original; });
});

test("incoming public messages restore only other users' hidden inbox entries", async (t) => {
  const originalCreate = prisma.message.create;
  const originalUpdate = prisma.conversation.update;
  prisma.message.create = async () => ({ id: "message" });
  prisma.conversation.update = async () => ({});
  t.after(() => { prisma.message.create = originalCreate; prisma.conversation.update = originalUpdate; });
  t.mock.method(prisma, "$transaction", async (ops) => Promise.all(ops));
  await createAndTouch({ conversationId: "room", senderId: "sender", senderRole: "BUYER", type: "TEXT", body: "hello" });
  const where = prisma.inboxDismissal.deleteMany.mock.calls[0].arguments[0].where;
  assert.equal(where.conversationId, "room");
  assert.deepEqual(where.userId, { not: "sender" });
  assert.ok(where.hiddenAt.lte instanceof Date);
  await createAndTouch({ conversationId: "room", senderId: "sender", senderRole: "BUYER", type: "TEXT", body: "note", visibility: "INTERNAL" });
  await createAndTouch({ conversationId: "room", senderId: "system", senderRole: "SYSTEM", type: "SYSTEM", body: "status" });
  assert.equal(prisma.inboxDismissal.deleteMany.mock.callCount(), 1);
});

test("createAndTouch updates preview and lastMessageAt for public messages", async () => {
  const origTransaction = prisma.$transaction;
  const origMessageCreate = prisma.message.create;
  const origConversationUpdate = prisma.conversation.update;

  let messageCreateData = null;
  let conversationUpdateData = null;

  prisma.message.create = (args) => {
    messageCreateData = args.data;
    return Promise.resolve({ id: "msg-pub-1", ...args.data });
  };
  prisma.conversation.update = (args) => {
    conversationUpdateData = args.data;
    return Promise.resolve({ id: args.where.id, ...args.data });
  };
  prisma.$transaction = async (ops) => {
    return Promise.all(ops);
  };

  try {
    const msg = await createAndTouch({
      conversationId: "conv-1",
      senderId: "user-1",
      senderRole: "BUYER",
      type: "TEXT",
      body: "Hello seller",
      visibility: "ALL",
    });

    assert.equal(msg.id, "msg-pub-1");
    assert.equal(messageCreateData.visibility, "ALL");
    assert.equal(messageCreateData.body, "Hello seller");
    assert.ok(conversationUpdateData.lastMessageAt instanceof Date);
    assert.equal(conversationUpdateData.lastMessagePreview, "Hello seller");
  } finally {
    prisma.$transaction = origTransaction;
    prisma.message.create = origMessageCreate;
    prisma.conversation.update = origConversationUpdate;
  }
});

test("createAndTouch retries a burst-send write conflict instead of failing the send", async () => {
  const origTransaction = prisma.$transaction;
  const origMessageCreate = prisma.message.create;
  const origConversationUpdate = prisma.conversation.update;

  let transactionCalls = 0;
  prisma.message.create = (args) => Promise.resolve({ id: "msg-retry", ...args.data });
  prisma.conversation.update = (args) => Promise.resolve({ id: args.where.id });
  prisma.$transaction = async (ops) => {
    transactionCalls += 1;
    if (transactionCalls < 3) {
      throw Object.assign(new Error("Transaction failed due to a write conflict"), {
        code: "P2034",
      });
    }
    return Promise.all(ops);
  };

  try {
    const msg = await createAndTouch({
      conversationId: "conv-1",
      senderId: "user-1",
      senderRole: "BUYER",
      type: "TEXT",
      body: "e",
    });
    assert.equal(msg.id, "msg-retry");
    assert.equal(transactionCalls, 3);
  } finally {
    prisma.$transaction = origTransaction;
    prisma.message.create = origMessageCreate;
    prisma.conversation.update = origConversationUpdate;
  }
});

test("createAndTouch does NOT update lastMessagePreview or lastMessageAt for INTERNAL messages", async () => {
  const origTransaction = prisma.$transaction;
  const origMessageCreate = prisma.message.create;
  const origConversationUpdate = prisma.conversation.update;

  let conversationUpdated = false;

  prisma.message.create = (args) => {
    return Promise.resolve({ id: "msg-int-1", ...args.data });
  };
  prisma.conversation.update = () => {
    conversationUpdated = true;
    return Promise.resolve({});
  };
  prisma.$transaction = async (ops) => {
    return Promise.all(ops);
  };

  try {
    const msg = await createAndTouch({
      conversationId: "conv-1",
      senderId: "agent-1",
      senderRole: "AGENT",
      type: "TEXT",
      body: "Private internal investigation note",
      visibility: "INTERNAL",
    });

    assert.equal(msg.id, "msg-int-1");
    assert.equal(msg.visibility, "INTERNAL");
    // Crucial: Conversation preview/lastMessageAt must never be touched
    assert.equal(conversationUpdated, false);
  } finally {
    prisma.$transaction = origTransaction;
    prisma.message.create = origMessageCreate;
    prisma.conversation.update = origConversationUpdate;
  }
});

test("createAndTouch with INTERNAL visibility updates participants without touching lastMessagePreview", async () => {
  const origTransaction = prisma.$transaction;
  const origMessageCreate = prisma.message.create;
  const origConversationUpdate = prisma.conversation.update;

  let conversationUpdateData = null;

  prisma.message.create = (args) => {
    return Promise.resolve({ id: "msg-int-2", ...args.data });
  };
  prisma.conversation.update = (args) => {
    conversationUpdateData = args.data;
    return Promise.resolve({ id: args.where.id, ...args.data });
  };
  prisma.$transaction = async (ops) => {
    return Promise.all(ops);
  };

  try {
    const participants = [{ userId: "agent-1", role: "AGENT" }];
    await createAndTouch({
      conversationId: "conv-1",
      senderId: "agent-1",
      senderRole: "AGENT",
      type: "TEXT",
      body: "Private note with participant sync",
      visibility: "INTERNAL",
      participants,
    });

    assert.ok(conversationUpdateData);
    assert.deepEqual(conversationUpdateData.participants, {
      set: participants,
    });
    assert.equal(conversationUpdateData.lastMessagePreview, undefined);
    assert.equal(conversationUpdateData.lastMessageAt, undefined);
  } finally {
    prisma.$transaction = origTransaction;
    prisma.message.create = origMessageCreate;
    prisma.conversation.update = origConversationUpdate;
  }
});

test("countUnread excludes INTERNAL messages by default to prevent leaking activity to requester", async () => {
  const origCount = prisma.message.count;
  let capturedWhere = null;

  prisma.message.count = (args) => {
    capturedWhere = args.where;
    return Promise.resolve(0);
  };

  try {
    await countUnread({
      conversationId: "conv-1",
      userId: "user-buyer",
      since: new Date(0),
    });

    assert.ok(capturedWhere);
    assert.equal(capturedWhere.conversationId, "conv-1");
    assert.deepEqual(capturedWhere.visibility, { not: "INTERNAL" });
    assert.equal(capturedWhere.deletedAt, null);
  } finally {
    prisma.message.count = origCount;
  }
});
