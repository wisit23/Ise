const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const ticketService = require("./ticketService");
const ticketModel = require("./ticketModel");
const chatClient = require("../../services/chatClient");
const auditLog = require("../audit/auditLog");

test('CS cannot mutate unassigned tickets and closed tickets cannot be claimed', async (t) => {
  t.mock.method(ticketModel,'findById',async()=>({id:'unassigned',requesterId:'buyer',assigneeId:null,status:'NEW',version:1}));
  await assert.rejects(ticketService.reply({ticketId:'unassigned',userId:'cs',role:'CUSTOMER_SERVICE',body:'hello'}),{status:403});
  await assert.rejects(ticketService.changeStatus({ticketId:'unassigned',userId:'cs',role:'CUSTOMER_SERVICE',status:'CLOSED'}),{status:403});
  t.mock.method(ticketModel,'findById',async()=>({id:'closed',requesterId:'buyer',assigneeId:null,status:'CLOSED',version:1}));
  await assert.rejects(ticketService.assignToSelf({ticketId:'closed',userId:'cs',role:'CUSTOMER_SERVICE'}),{status:400});
});
test('invalid ticket scope is rejected before it can remove owner filtering',async()=>{
  await assert.rejects(ticketService.listQueue({role:'CUSTOMER_SERVICE',userId:'cs',scope:'anything'}),{status:400});
});
test('claim reports committed ownership when chat membership refresh fails',async(t)=>{
  let assigned=false;
  t.mock.method(ticketModel,'findById',async()=>({id:'claim',requesterId:'buyer',assigneeId:assigned?'cs':null,status:assigned?'ASSIGNED':'NEW',version:1,conversationId:'room'}));
  t.mock.method(ticketModel,'assign',async()=>{assigned=true;return true;});
  t.mock.method(chatClient,'addAgentToConversation',async()=>{throw new Error('chat unavailable');});
  const result=await ticketService.assignToSelf({ticketId:'claim',userId:'cs',role:'CUSTOMER_SERVICE'});
  assert.equal(result.assigneeId,'cs');assert.ok(result.chatJoinError);
});

test("Admin cannot send a customer-facing ticket reply", async () => {
  await assert.rejects(
    () => ticketService.reply({ ticketId: "ticket-1", userId: "admin-1", role: "ADMIN", body: "hello", isInternal: false }),
    (err) => err.status === 403,
  );
});

test("joinTicketChat is idempotent on repeated calls and writes audit log exactly once", async () => {
  const origFindById = ticketModel.findById;
  const origAuditFindFirst = prisma.ticketAuditLog.findFirst;
  const origAuditRecord = auditLog.record;
  const origAddParticipant = chatClient.addParticipantToConversation;

  let auditCount = 0;
  const mockTicket = {
    id: "ticket-join-1",
    ticketNumber: "#CS-999999",
    requesterId: "buyer-10",
    assigneeId: "agent-1",
    conversationId: "conv-100",
    status: "IN_PROGRESS",
  };

  ticketModel.findById = () => Promise.resolve(mockTicket);
  chatClient.addParticipantToConversation = () =>
    Promise.resolve({ id: "conv-100" });

  let recordedAudit = null;
  prisma.ticketAuditLog.findFirst = () => {
    // First call: not found. Subsequent calls: found!
    if (auditCount === 0) return Promise.resolve(null);
    return Promise.resolve(recordedAudit);
  };

  auditLog.record = (data) => {
    auditCount++;
    recordedAudit = { id: "audit-join-1", ...data };
    return Promise.resolve(recordedAudit);
  };

  try {
    // First call
    const res1 = await ticketService.joinTicketChat({
      ticketId: "ticket-join-1",
      userId: "agent-1",
      role: "CUSTOMER_SERVICE",
    });

    assert.equal(res1.conversationId, "conv-100");
    assert.equal(res1.role, "AGENT");
    assert.equal(auditCount, 1);

    // Repeated call: must be idempotent and must NOT write duplicate audit log
    const res2 = await ticketService.joinTicketChat({
      ticketId: "ticket-join-1",
      userId: "agent-1",
      role: "CUSTOMER_SERVICE",
    });

    assert.equal(res2.conversationId, "conv-100");
    assert.equal(
      auditCount,
      1,
      "Repeated joinTicketChat must not write duplicate audit event",
    );
  } finally {
    ticketModel.findById = origFindById;
    prisma.ticketAuditLog.findFirst = origAuditFindFirst;
    auditLog.record = origAuditRecord;
    chatClient.addParticipantToConversation = origAddParticipant;
  }
});

test("joinTicketChat forbids normal CS agent on ESCALATED ticket", async () => {
  const origFindById = ticketModel.findById;

  ticketModel.findById = () =>
    Promise.resolve({
      id: "ticket-esc-1",
      requesterId: "buyer-1",
      status: "ESCALATED",
      conversationId: "conv-esc-1",
    });

  try {
    await assert.rejects(
      () =>
        ticketService.joinTicketChat({
          ticketId: "ticket-esc-1",
          userId: "agent-1",
          role: "CUSTOMER_SERVICE",
        }),
      { status: 403 },
    );
  } finally {
    ticketModel.findById = origFindById;
  }
});

test("requester retains access to their escalated ticket conversation", async (t) => {
  const originalFind = ticketModel.findById;
  const originalAdd = chatClient.addParticipantToConversation;
  const originalAuditFind = prisma.ticketAuditLog.findFirst;
  const originalAudit = auditLog.record;
  t.after(() => {
    ticketModel.findById = originalFind;
    chatClient.addParticipantToConversation = originalAdd;
    prisma.ticketAuditLog.findFirst = originalAuditFind;
    auditLog.record = originalAudit;
  });
  ticketModel.findById = async () => ({
    id: "ticket-esc-1",
    requesterId: "buyer-1",
    assigneeId: "agent-1",
    status: "ESCALATED",
    conversationId: "conv-esc-1",
  });
  let role;
  chatClient.addParticipantToConversation = async (_id, _userId, value) => {
    role = value;
  };
  prisma.ticketAuditLog.findFirst = async () => ({ id: "existing-audit" });
  auditLog.record = async () => {
    throw new Error("unexpected audit write");
  };
  const result = await ticketService.joinTicketChat({
    ticketId: "ticket-esc-1",
    userId: "buyer-1",
    role: "BUYER",
  });
  assert.equal(result.conversationId, "conv-esc-1");
  assert.equal(role, "BUYER");
});

test("changeStatus does not falsely report chatLocked: true if chat locking failed", async () => {
  const origFindById = ticketModel.findById;
  const origTransitionStatus = ticketModel.transitionStatus;
  const origAuditRecord = auditLog.record;
  const origLockConversation = chatClient.lockConversation;

  ticketModel.findById = () =>
    Promise.resolve({
      id: "ticket-close-1",
      requesterId: "buyer-1",
      assigneeId: "agent-1",
      status: "RESOLVED",
      conversationId: "conv-close-1",
      version: 1,
    });

  ticketModel.transitionStatus = () => Promise.resolve(true);
  auditLog.record = () => Promise.resolve({});

  chatClient.lockConversation = () => {
    return Promise.reject(new Error("chat-service network timeout"));
  };

  try {
    const updated = await ticketService.changeStatus({
      ticketId: "ticket-close-1",
      userId: "agent-1",
      role: "CUSTOMER_SERVICE",
      status: "CLOSED",
      reason: "Resolved customer inquiry",
    });

    assert.ok(updated);
    // Crucial: Must NOT falsely report chatLocked: true when lock failed
    assert.equal(updated.chatLocked, false);
    assert.ok(updated.chatLockError.includes("timeout"));
  } finally {
    ticketModel.findById = origFindById;
    ticketModel.transitionStatus = origTransitionStatus;
    auditLog.record = origAuditRecord;
    chatClient.lockConversation = origLockConversation;
  }
});
