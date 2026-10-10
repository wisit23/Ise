const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const model = require("./ticketModel");
const { toTicket } = require("./ticketShape");

test("admin queue includes closed/escalated while CS sees only own or unassigned cases", () => {
  const admin = model.queueFilter({ role: "ADMIN", scope: "all" });
  assert.equal(admin.sql, "");
  const staff = model.queueFilter({
    role: "CUSTOMER_SERVICE",
    scope: "all",
    assigneeId: "agent-1",
    search: "ref%und",
  });
  assert.match(staff.sql, /assignment_id IS NULL OR a.assignee_id/);
  assert.match(staff.sql, /s.code <> 'ESCALATED'/);
  assert.deepEqual(staff.values, ["agent-1", "%ref\\%und%", "%ref\\%und%"]);
});
test("conversation repair accepts the same link but never replaces another room", async () => {
  const db = {
    supportTicket: { findUnique: async () => ({ id: "ticket-1" }) },
    ticketChatLink: {
      findUnique: async () => ({ conversationId: "room-existing" }),
    },
    $executeRaw: async () => 0,
  };
  await model.setConversationId("ticket-1", "room-existing", db);
  await assert.rejects(model.setConversationId("ticket-1", "room-other", db), {
    status: 409,
  });
});

function chatDb(t, { existing = null } = {}) {
  const records = { messages: [], audits: [], achieved: [] };
  const db = {
    supportTicket: {
      findUnique: async () => ({
        id: "ticket-1",
        requesterId: "buyer-1",
        chatLink: { conversationId: "conv-1" },
      }),
    },
    ticketMessage: {
      findUnique: async () => existing,
      create: async ({ data }) => {
        records.messages.push(data);
        return { id: "message-1", ...data };
      },
    },
    ticketSlaTarget: {
      updateMany: async (args) => {
        records.achieved.push(args);
        return { count: 1 };
      },
    },
    ticketAuditLog: {
      findUnique: async () => existing,
      create: async ({ data }) => {
        records.audits.push(data);
        return data;
      },
    },
  };
  t.mock.method(prisma, "$transaction", async (work) => work(db));
  return records;
}
const chatInput = {
  ticketId: "ticket-1",
  conversationId: "conv-1",
  chatMessageId: "msg-1",
  authorId: "agent-1",
  authorRole: "AGENT",
  body: "Answer",
  createdAt: "2026-10-07T00:00:00Z",
};
test("duplicate chat delivery does not create another message/audit", async (t) => {
  const records = chatDb(t, {
    existing: { id: "message-1", ticketId: "ticket-1" },
  });
  assert.equal(
    (await model.recordChatMessage(chatInput)).alreadyRecorded,
    true,
  );
  assert.equal(records.messages.length, 0);
  assert.equal(records.audits.length, 0);
});
test("duplicate delivery still validates ticket/conversation correlation", async (t) => {
  chatDb(t, { existing: { id: "message-1", ticketId: "ticket-1" } });
  await assert.rejects(
    model.recordChatMessage({ ...chatInput, conversationId: "other-room" }),
    { status: 400 },
  );
});
test("customer-facing reply satisfies FIRST_RESPONSE and audits in the same transaction", async (t) => {
  const records = chatDb(t);
  const result = await model.recordChatMessage(chatInput);
  assert.equal(result.alreadyRecorded, false);
  assert.deepEqual(records.achieved[0].where, {
    ticketId: "ticket-1",
    metricType: "FIRST_RESPONSE",
    OR: [
      { achievedAt: null },
      { achievedAt: { gt: new Date(chatInput.createdAt) } },
    ],
  });
  assert.equal(
    +records.achieved[0].data.achievedAt,
    +new Date(chatInput.createdAt),
  );
  assert.equal(records.audits[0].action, "REPLY");
  assert.equal(records.audits[0].dedupeKey, "chat:msg-1");
  assert.equal(records.messages.length, 0);
  assert.equal(records.audits[0].payload.body, undefined);
});
test("internal notes and requester messages never satisfy FIRST_RESPONSE", async (t) => {
  const records = chatDb(t);
  await model.recordChatMessage({ ...chatInput, isInternal: true });
  await model.recordChatMessage({
    ...chatInput,
    authorId: "buyer-1",
    authorRole: "BUYER",
  });
  assert.equal(records.achieved.length, 0);
});
test("invalid chat dates/IDs are rejected before database work", async () => {
  await assert.rejects(
    model.recordChatMessage({ ...chatInput, createdAt: "bad-date" }),
    { status: 400 },
  );
  await assert.rejects(
    model.recordChatMessage({ ...chatInput, chatMessageId: undefined }),
    { status: 400 },
  );
});
test("API projection derives current assignee, SLA and lifecycle without exposing history", () => {
  const row = {
    id: "ticket-1",
    category: { code: "ORDER" },
    priority: { code: "NORMAL" },
    currentStatus: { code: "RESOLVED" },
    assignments: [{ assigneeId: "agent-1" }],
    statusHistory: [
      { toStatus: { code: "RESOLVED" }, createdAt: new Date(1000) },
    ],
    slaTargets: [
      {
        metricType: "FIRST_RESPONSE",
        dueAt: new Date(2000),
        achievedAt: new Date(100),
      },
      {
        metricType: "RESOLUTION",
        dueAt: new Date(3000),
        achievedAt: new Date(1000),
      },
    ],
    chatLink: { conversationId: "conv-1" },
    messages: [],
  };
  const result = toTicket(row);
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.assigneeId, "agent-1");
  assert.equal(+result.firstResponseAt, 100);
  assert.equal(+result.resolvedAt, 1000);
  assert.equal(result.conversationId, "conv-1");
  assert.equal("statusHistory" in result, false);
});

test("dashboard SLA filters exclude terminal work and compare the pending target before pagination", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  const result = model.queueFilter({
    role: "CUSTOMER_SERVICE",
    scope: "mine",
    assigneeId: "cs",
    work: "soon",
    now,
  });
  assert.match(result.sql, /achieved_at IS NULL/);
  assert.match(result.sql, /NEW.*ASSIGNED.*IN_PROGRESS.*PENDING_USER/);
  assert.ok(
    result.values.some((value) => value instanceof Date && +value === +now),
  );
  assert.ok(
    result.values.some(
      (value) => value instanceof Date && +value === +now + 3600000,
    ),
  );
});
