const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const ticketModel = require("./ticketModel");

test("recordChatMessage returns alreadyRecorded: true on duplicate chatMessageId", async () => {
  const origFindUnique = prisma.ticketMessage.findUnique;

  prisma.ticketMessage.findUnique = ({ where }) => {
    if (where.chatMessageId === "existing-msg-1") {
      return Promise.resolve({ id: "tm-1", chatMessageId: "existing-msg-1", body: "hello" });
    }
    return Promise.resolve(null);
  };

  try {
    const result = await ticketModel.recordChatMessage({
      ticketId: "ticket-1",
      chatMessageId: "existing-msg-1",
      authorId: "user-1",
      authorRole: "BUYER",
      body: "hello",
    });

    assert.equal(result.alreadyRecorded, true);
    assert.equal(result.message.chatMessageId, "existing-msg-1");
  } finally {
    prisma.ticketMessage.findUnique = origFindUnique;
  }
});

test("recordChatMessage atomically updates firstResponseAt only for customer-facing agent reply", async () => {
  const origFindUniqueMsg = prisma.ticketMessage.findUnique;
  const origFindUniqueTicket = prisma.supportTicket.findUnique;
  const origTransaction = prisma.$transaction;

  let capturedTicketUpdateMany = null;
  let capturedAudit = null;

  prisma.ticketMessage.findUnique = () => Promise.resolve(null);
  prisma.supportTicket.findUnique = () =>
    Promise.resolve({
      id: "ticket-10",
      ticketNumber: "#CS-123456",
      requesterId: "buyer-1",
      conversationId: "conv-1",
      firstResponseAt: null,
    });

  const txMock = {
    ticketMessage: {
      findUnique: () => Promise.resolve(null),
      create: ({ data }) => Promise.resolve({ id: "tm-new", ...data }),
    },
    supportTicket: {
      updateMany: (args) => {
        capturedTicketUpdateMany = args;
        return Promise.resolve({ count: 1 });
      },
    },
    ticketAuditLog: {
      create: ({ data }) => {
        capturedAudit = data;
        return Promise.resolve({ id: "audit-1", ...data });
      },
    },
  };

  prisma.$transaction = async (fn) => fn(txMock);

  try {
    const replyDate = new Date("2026-09-20T10:00:00Z");
    const result = await ticketModel.recordChatMessage({
      ticketId: "ticket-10",
      conversationId: "conv-1",
      chatMessageId: "agent-reply-1",
      authorId: "agent-99",
      authorRole: "AGENT",
      body: "We are reviewing your claim.",
      isInternal: false,
      createdAt: replyDate.toISOString(),
    });

    assert.equal(result.alreadyRecorded, false);
    // Crucial: firstResponseAt update must be atomic via updateMany with where: { firstResponseAt: null }
    assert.ok(capturedTicketUpdateMany, "Atomic updateMany must be called");
    assert.deepEqual(capturedTicketUpdateMany.where, {
      id: "ticket-10",
      firstResponseAt: null,
    });
    assert.deepEqual(capturedTicketUpdateMany.data, {
      firstResponseAt: replyDate,
    });
    assert.ok(capturedAudit);
    assert.equal(capturedAudit.action, "REPLY");
  } finally {
    prisma.ticketMessage.findUnique = origFindUniqueMsg;
    prisma.supportTicket.findUnique = origFindUniqueTicket;
    prisma.$transaction = origTransaction;
  }
});

test("recordChatMessage does NOT update firstResponseAt when message is internal note", async () => {
  const origFindUniqueMsg = prisma.ticketMessage.findUnique;
  const origFindUniqueTicket = prisma.supportTicket.findUnique;
  const origTransaction = prisma.$transaction;

  let ticketUpdateCalled = false;

  prisma.ticketMessage.findUnique = () => Promise.resolve(null);
  prisma.supportTicket.findUnique = () =>
    Promise.resolve({
      id: "ticket-11",
      requesterId: "buyer-1",
      conversationId: "conv-11",
      firstResponseAt: null,
    });

  const txMock = {
    ticketMessage: {
      findUnique: () => Promise.resolve(null),
      create: ({ data }) => Promise.resolve({ id: "tm-int", ...data }),
    },
    supportTicket: {
      updateMany: () => {
        ticketUpdateCalled = true;
        return Promise.resolve({ count: 0 });
      },
    },
    ticketAuditLog: {
      create: ({ data }) => Promise.resolve({ id: "audit-2", ...data }),
    },
  };

  prisma.$transaction = async (fn) => fn(txMock);

  try {
    const result = await ticketModel.recordChatMessage({
      ticketId: "ticket-11",
      conversationId: "conv-11",
      chatMessageId: "agent-internal-note-1",
      authorId: "agent-99",
      authorRole: "AGENT",
      body: "Private agent-only investigation notes.",
      isInternal: true,
      createdAt: new Date().toISOString(),
    });

    assert.equal(result.alreadyRecorded, false);
    // Internal notes must NEVER update firstResponseAt
    assert.equal(ticketUpdateCalled, false);
  } finally {
    prisma.ticketMessage.findUnique = origFindUniqueMsg;
    prisma.supportTicket.findUnique = origFindUniqueTicket;
    prisma.$transaction = origTransaction;
  }
});

test("recordChatMessage rejects invalid date format safely", async () => {
  const origFindUniqueMsg = prisma.ticketMessage.findUnique;
  prisma.ticketMessage.findUnique = () => Promise.resolve(null);

  try {
    await assert.rejects(
      () =>
        ticketModel.recordChatMessage({
          ticketId: "ticket-1",
          chatMessageId: "msg-bad-date",
          authorId: "user-1",
          authorRole: "BUYER",
          body: "hi",
          createdAt: "not-a-valid-date",
        }),
      { status: 400 },
    );
  } finally {
    prisma.ticketMessage.findUnique = origFindUniqueMsg;
  }
});

test("recordChatMessage rejects missing chatMessageId", async () => {
  await assert.rejects(
    () =>
      ticketModel.recordChatMessage({
        ticketId: "ticket-1",
        authorId: "user-1",
        authorRole: "BUYER",
        body: "hi",
      }),
    { status: 400 },
  );
});
