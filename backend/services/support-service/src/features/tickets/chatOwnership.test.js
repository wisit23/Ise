const test = require("node:test");
const assert = require("node:assert/strict");
const tickets = require("./ticketModel");
const service = require("./ticketService");
const chat = require("../../services/chatClient");
const prisma = require("../../models/prismaClient");
const { migrate } = require("../../../prisma/migrateMessagesToChat");

test("ticket replies write to Chat only and preserve legacy API shape", async (t) => {
  t.mock.method(tickets, "findById", async () => ({ id: "ticket", requesterId: "buyer", assigneeId: "agent", conversationId: "room", status: "IN_PROGRESS" }));
  t.mock.method(chat, "addParticipantToConversation", async () => ({}));
  const original = prisma.ticketAuditLog.findFirst;
  prisma.ticketAuditLog.findFirst = async () => ({ id: "joined" });
  t.after(() => { prisma.ticketAuditLog.findFirst = original; });
  let data;
  t.mock.method(chat, "sendTicketMessage", async (_id, body) => { data = body; return { id: "msg", senderId: "agent", senderRole: "AGENT", body: body.body, visibility: body.visibility }; });
  const result = await service.reply({ ticketId: "ticket", userId: "agent", role: "CUSTOMER_SERVICE", body: " answer ", isInternal: true, eventKey: "key" });
  assert.equal(data.visibility, "INTERNAL");
  assert.equal(data.eventKey, "key");
  assert.equal(result.isInternal, true);
  assert.equal(result.chatMessageId, "msg");
  assert.equal(tickets.addMessage, undefined);
});
test("requester history is fetched without internal notes and double-filtered", async (t) => {
  t.mock.method(tickets, "findById", async () => ({ id: "ticket", requesterId: "buyer", conversationId: "room" }));
  t.mock.method(chat, "getTicketMessages", async (_id, options) => {
    assert.equal(options.includeInternal, false);
    return { messages: [{ id: "a", visibility: "ALL" }, { id: "b", visibility: "INTERNAL" }], nextCursor: "older" };
  });
  const ticket = await service.getTicket({ ticketId: "ticket", userId: "buyer", role: "BUYER" });
  assert.equal(ticket.messages.length, 1);
  assert.equal(ticket.messagesNextCursor, "older");
});
test("Chat outage leaves ticket available with explicit unavailable-history flag", async (t) => {
  t.mock.method(tickets, "findById", async () => ({ id: "ticket", requesterId: "buyer", conversationId: "room" }));
  t.mock.method(chat, "getTicketMessages", async () => { throw Object.assign(new Error("unavailable"), { status: 503 }); });
  const ticket = await service.getTicket({ ticketId: "ticket", userId: "buyer", role: "BUYER" });
  assert.equal(ticket.chatAvailable, false);
  assert.ok(ticket.chatError);
});
test("migration dry-run writes nothing; apply verifies every source without deleting archive", async () => {
  let read = 0, imports = 0, events = 0;
  const row = { id: "old", ticketId: "ticket", authorId: "buyer", authorRole: "REQUESTER", body: "old", isInternal: false, createdAt: new Date(), ticket: { chatLink: { conversationId: "room" } } };
  const db = { ticketMessage: { findMany: async () => read++ === 0 ? [row] : [] } };
  const chatClient = { importTicketMessage: async (_id, data) => { imports++; assert.equal(data.sourceId, "old"); return { id: "chat-id", senderId: "buyer", senderRole: "BUYER", createdAt: row.createdAt }; } };
  const ticketModel = { recordChatMessage: async () => { events++; } };
  assert.equal((await migrate({ db, chatClient, ticketModel })).pending, 1);
  assert.equal(imports, 0);
  read = 0;
  assert.deepEqual(await migrate({ db, chatClient, ticketModel, apply: true }), { verified: 1, pending: 0, archiveDeleted: false });
  assert.equal(imports, 1);
  assert.equal(events, 1);
});
