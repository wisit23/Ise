const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.INTERNAL_SERVICE_TOKEN = "test-internal-token";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const { signAccessToken } = require("@reloop/shared");
const app = require("../src/app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};
const ticketModel = require("../src/features/tickets/ticketModel");
const ticketService = require("../src/features/tickets/ticketService");
const prisma = require("../src/models/prismaClient");
const chatClient = require("../src/services/chatClient");

const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

// Tokens for different roles
const strangerToken = signAccessToken({ sub: "stranger-999", role: "BUYER" });
const agentAToken = signAccessToken({
  sub: "agent-A",
  role: "CUSTOMER_SERVICE",
});
const agentBToken = signAccessToken({
  sub: "agent-B",
  role: "CUSTOMER_SERVICE",
});
const adminToken = signAccessToken({ sub: "admin-1", role: "ADMIN" });
const safetyToken = signAccessToken({
  sub: "safety-1",
  role: "TRUST_AND_SAFETY",
});

test("Internal chat events endpoint security and validation", async (t) => {
  await t.test("rejects request without internal token with 403", async () => {
    const res = await request(app)
      .post("/internal/chat-events")
      .send({ chatMessageId: "msg-1", ticketId: "ticket-1" });
    assert.equal(res.status, 403);
  });

  await t.test(
    "rejects request with invalid internal token with 403",
    async () => {
      const res = await request(app)
        .post("/internal/chat-events")
        .set("x-internal-token", "wrong-token")
        .send({ chatMessageId: "msg-1", ticketId: "ticket-1" });
      assert.equal(res.status, 403);
    },
  );

  await t.test(
    "rejects request with missing chatMessageId with 400",
    async () => {
      const res = await request(app)
        .post("/internal/chat-events")
        .set("x-internal-token", INTERNAL_TOKEN)
        .send({ ticketId: "ticket-1" });
      assert.equal(res.status, 400);
    },
  );
});

test("ticketModel.recordChatMessage idempotency, correlation and firstResponseAt", async (t) => {
  // Setup in-memory mock data
  const ticketId = "ticket-correlate-1";
  const conversationId = "conv-correlate-1";
  const chatMessageId = "chat-msg-dup-1";

  const fakeTicket = {
    id: ticketId,
    ticketNumber: "#CS-100001",
    requesterId: "buyer-123",
    subject: "Test Correlation",
    status: "IN_PROGRESS",
    assigneeId: "agent-A",
    conversationId: conversationId,
    firstResponseAt: null,
  };

  const storedMessages = [];
  const storedAudits = [];

  const originalFindUnique = prisma.ticketMessage.findUnique;
  const originalTicketFindUnique = prisma.supportTicket.findUnique;
  const originalTicketUpdate = prisma.supportTicket.update;
  const originalTicketAuditCreate = prisma.ticketAuditLog.create;
  const originalTicketMessageCreate = prisma.ticketMessage.create;
  const originalTransaction = prisma.$transaction;

  // Mock Prisma for deterministic contract testing
  prisma.supportTicket.findUnique = async ({ where }) => {
    if (where.id === ticketId) return { ...fakeTicket };
    return null;
  };

  prisma.supportTicket.update = async ({ where, data }) => {
    if (where.id === ticketId) {
      Object.assign(fakeTicket, data);
      return { ...fakeTicket };
    }
    return null;
  };

  prisma.ticketMessage.findUnique = async ({ where }) => {
    return (
      storedMessages.find((m) => m.chatMessageId === where.chatMessageId) ||
      null
    );
  };

  prisma.ticketMessage.create = async ({ data }) => {
    const msg = { id: `tm-${storedMessages.length + 1}`, ...data };
    storedMessages.push(msg);
    return msg;
  };

  prisma.ticketAuditLog.create = async ({ data }) => {
    const audit = { id: `audit-${storedAudits.length + 1}`, ...data };
    storedAudits.push(audit);
    return audit;
  };

  prisma.$transaction = async (callback) => {
    return callback({
      ticketMessage: {
        findUnique: prisma.ticketMessage.findUnique,
        create: prisma.ticketMessage.create,
      },
      supportTicket: {
        findUnique: prisma.supportTicket.findUnique,
        update: prisma.supportTicket.update,
        updateMany: async ({ where, data }) => {
          if (where.id === ticketId) {
            Object.assign(fakeTicket, data);
            return { count: 1 };
          }
          return { count: 0 };
        },
      },
      ticketAuditLog: {
        create: prisma.ticketAuditLog.create,
      },
    });
  };

  t.after(() => {
    prisma.ticketMessage.findUnique = originalFindUnique;
    prisma.supportTicket.findUnique = originalTicketFindUnique;
    prisma.supportTicket.update = originalTicketUpdate;
    prisma.ticketAuditLog.create = originalTicketAuditCreate;
    prisma.ticketMessage.create = originalTicketMessageCreate;
    prisma.$transaction = originalTransaction;
  });

  await t.test(
    "rejects correlation mismatch between ticket and conversation",
    async () => {
      await assert.rejects(async () => {
        await ticketModel.recordChatMessage({
          ticketId,
          conversationId: "different-conv-999",
          chatMessageId: "msg-mismatch-1",
          authorId: "buyer-123",
          authorRole: "BUYER",
          body: "Hello",
        });
      }, /correlation mismatch/i);
    },
  );

  await t.test(
    "first delivery creates exactly one TicketMessage and one REPLY audit log",
    async () => {
      const result = await ticketModel.recordChatMessage({
        ticketId,
        conversationId,
        chatMessageId,
        authorId: "agent-A",
        authorRole: "AGENT",
        body: "First agent reply",
      });

      assert.equal(result.alreadyRecorded, false);
      assert.equal(result.message.chatMessageId, chatMessageId);
      assert.equal(storedMessages.length, 1);
      assert.equal(storedAudits.length, 1);
      assert.equal(storedAudits[0].action, "REPLY");
      assert.equal(storedAudits[0].ticketId, ticketId);
      assert.ok(
        fakeTicket.firstResponseAt,
        "firstResponseAt should be updated for agent reply",
      );
    },
  );

  await t.test(
    "second delivery with same chatMessageId is idempotent (no duplicate message or audit)",
    async () => {
      const result2 = await ticketModel.recordChatMessage({
        ticketId,
        conversationId,
        chatMessageId,
        authorId: "agent-A",
        authorRole: "AGENT",
        body: "First agent reply",
      });

      assert.equal(result2.alreadyRecorded, true);
      assert.equal(result2.message.chatMessageId, chatMessageId);
      assert.equal(
        storedMessages.length,
        1,
        "Must still have exactly one TicketMessage",
      );
      assert.equal(
        storedAudits.length,
        1,
        "Must still have exactly one audit log",
      );
    },
  );

  await t.test(
    "requester message does not update firstResponseAt",
    async () => {
      fakeTicket.firstResponseAt = null; // reset
      const userMsgId = "user-chat-msg-1";

      const userResult = await ticketModel.recordChatMessage({
        ticketId,
        conversationId,
        chatMessageId: userMsgId,
        authorId: "buyer-123",
        authorRole: "BUYER",
        body: "User asking a question",
      });

      assert.equal(userResult.alreadyRecorded, false);
      assert.equal(
        fakeTicket.firstResponseAt,
        null,
        "firstResponseAt must NOT be set by requester message",
      );
    },
  );
});

test("Ticket Chat Join/Continue Authorization, Same-Room Continuation and Privacy", async (t) => {
  const escalatedTicketId = "ticket-escalated-1";
  const regularTicketId = "ticket-regular-1";
  const unassignedTicketId = "ticket-unassigned-1";
  const sharedConversationId = "conv-shared-room-1";

  const fakeEscalated = {
    id: escalatedTicketId,
    ticketNumber: "#CS-200001",
    requesterId: "buyer-123",
    status: "ESCALATED",
    assigneeId: "agent-A",
    conversationId: sharedConversationId,
    messages: [
      { id: "m-1", body: "Help", isInternal: false },
      { id: "m-2", body: "Private agent note", isInternal: true },
    ],
  };

  const fakeRegular = {
    id: regularTicketId,
    ticketNumber: "#CS-200002",
    requesterId: "buyer-123",
    status: "IN_PROGRESS",
    assigneeId: "agent-A",
    conversationId: sharedConversationId,
    messages: [],
  };

  const fakeUnassigned = {
    id: unassignedTicketId,
    ticketNumber: "#CS-200003",
    requesterId: "buyer-123",
    status: "NEW",
    assigneeId: null,
    conversationId: null,
    messages: [],
  };

  const originalFindById = ticketModel.findById;
  const originalSetConversationId = ticketModel.setConversationId;
  const originalAuditRecord = prisma.ticketAuditLog.create;
  const originalAddParticipant = chatClient.addParticipantToConversation;
  const originalCreateSupportConv = chatClient.createSupportConversation;

  let addedParticipants = [];
  let auditedActions = [];

  ticketModel.findById = async (id) => {
    if (id === escalatedTicketId) return { ...fakeEscalated };
    if (id === regularTicketId) return { ...fakeRegular };
    if (id === unassignedTicketId) return { ...fakeUnassigned };
    return null;
  };

  ticketModel.setConversationId = async (id, convId) => {
    if (id === unassignedTicketId) fakeUnassigned.conversationId = convId;
    return { id, conversationId: convId };
  };

  prisma.ticketAuditLog.create = async ({ data }) => {
    auditedActions.push(data);
    return { id: `audit-${auditedActions.length}`, ...data };
  };

  chatClient.addParticipantToConversation = async (convId, userId, role) => {
    addedParticipants.push({ convId, userId, role });
    return { id: convId };
  };

  chatClient.createSupportConversation = async () => {
    return { id: "repaired-conv-id" };
  };

  t.after(() => {
    ticketModel.findById = originalFindById;
    ticketModel.setConversationId = originalSetConversationId;
    prisma.ticketAuditLog.create = originalAuditRecord;
    chatClient.addParticipantToConversation = originalAddParticipant;
    chatClient.createSupportConversation = originalCreateSupportConv;
  });

  await t.test(
    "normal CS agent cannot access or join an ESCALATED ticket",
    async () => {
      const res = await request(app)
        .post(`/tickets/${escalatedTicketId}/continue`)
        .set("Authorization", `Bearer ${agentAToken}`)
        .send();
      assert.equal(res.status, 403);
    },
  );

  await t.test(
    "normal CS agent cannot join a ticket assigned to another agent",
    async () => {
      const res = await request(app)
        .post(`/tickets/${regularTicketId}/join`)
        .set("Authorization", `Bearer ${agentBToken}`)
        .send();
      assert.equal(res.status, 403);
    },
  );

  await t.test("random buyer stranger gets 403 on join", async () => {
    const res = await request(app)
      .post(`/tickets/${regularTicketId}/join`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send();
    assert.equal(res.status, 403);
  });

  await t.test(
    "ADMIN can continue an ESCALATED ticket in the existing room without replacing it",
    async () => {
      addedParticipants = [];
      auditedActions = [];

      const res = await request(app)
        .post(`/tickets/${escalatedTicketId}/continue`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send();

      assert.equal(res.status, 200);
      assert.equal(
        res.body.conversationId,
        sharedConversationId,
        "Must return the SAME conversationId",
      );
      assert.equal(
        res.body.role,
        "ADMIN",
        "Admin must have ADMIN per-room role",
      );

      // Verify actor was added to chat without deleting room
      assert.equal(addedParticipants.length, 1);
      assert.equal(addedParticipants[0].convId, sharedConversationId);
      assert.equal(addedParticipants[0].userId, "admin-1");
      assert.equal(addedParticipants[0].role, "ADMIN");

      // Verify join / handoff audit
      assert.ok(auditedActions.length >= 1);
      const audit = auditedActions[0];
      assert.equal(audit.ticketId, escalatedTicketId);
      assert.equal(audit.actorId, "admin-1");
      assert.ok(audit.action === "HANDOFF" || audit.action === "JOIN");
    },
  );

  await t.test(
    "TRUST_AND_SAFETY can continue an ESCALATED ticket",
    async () => {
      const res = await request(app)
        .post(`/tickets/${escalatedTicketId}/continue`)
        .set("Authorization", `Bearer ${safetyToken}`)
        .send();

      assert.equal(res.status, 200);
      assert.equal(res.body.conversationId, sharedConversationId);
      assert.equal(res.body.role, "ADMIN");
    },
  );

  await t.test(
    "CS agent can join an unassigned ticket and missing conversation is repaired idempotently",
    async () => {
      fakeUnassigned.conversationId = null; // start missing
      addedParticipants = [];

      const res = await request(app)
        .post(`/tickets/${unassignedTicketId}/join`)
        .set("Authorization", `Bearer ${agentAToken}`)
        .send();

      assert.equal(res.status, 200);
      assert.equal(res.body.conversationId, "repaired-conv-id");
      assert.equal(res.body.role, "AGENT");
      assert.equal(fakeUnassigned.conversationId, "repaired-conv-id");
    },
  );

  await t.test(
    "internal notes are never exposed in requester-facing ticket view",
    async () => {
      const ticket = await ticketService.getTicket({
        ticketId: escalatedTicketId,
        userId: "buyer-123",
        role: "BUYER",
      });

      assert.equal(
        ticket.messages.some((m) => m.isInternal),
        false,
      );
      assert.equal(
        ticket.messages.some((m) => m.body.includes("Private")),
        false,
      );
    },
  );
});
