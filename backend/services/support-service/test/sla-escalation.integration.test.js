const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_SUPPORT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
}

const prisma = require("../src/models/prismaClient");
const slaMonitor = require("../src/features/sla/slaMonitor");
const ticketModel = require("../src/features/tickets/ticketModel");

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("SLA breach is recorded once while the ticket stays in CS and remains claimable", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_SUPPORT not set or database unreachable — set it to a disposable test database " +
      "(after running `node prisma/migrate.js` and `node prisma/seed.js` from backend/services/support-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const overdueTicket = await ticketModel.create({
    ticketNumber: `#CS-${Date.now().toString().slice(-6)}`,
    requesterId: "int-test-sla-requester",
    subject: "overdue test ticket",
    category: "OTHER",
    status: "NEW",
    priority: "NORMAL",
    slaDueAt: new Date(Date.now() - 60_000), // already overdue
  });
  const notYetDueTicket = await ticketModel.create({
    ticketNumber: `#CS-${(Date.now() + 1).toString().slice(-6)}`,
    requesterId: "int-test-sla-requester",
    subject: "not due yet",
    category: "OTHER",
    status: "NEW",
    priority: "NORMAL",
    slaDueAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  t.after(async () => {
    await prisma.supportTicket.deleteMany({ where: { id: { in: [overdueTicket.id, notYetDueTicket.id] } } });
    await prisma.$disconnect();
  });
  const breachedFirstRun = await slaMonitor.runOnce();
  assert.ok(breachedFirstRun >= 1);

  const afterFirst = await ticketModel.findById(overdueTicket.id);
  assert.equal(afterFirst.status, "NEW");
  assert.equal(afterFirst.escalatedAt, null);
  assert.equal(afterFirst.assigneeId, null);
  assert.equal(afterFirst.version, overdueTicket.version);
  const targets = await prisma.ticketSlaTarget.findMany({ where: { ticketId: overdueTicket.id, breachedAt: { not: null } } });
  assert.ok(targets.length > 0);
  const csQueue = await ticketModel.listQueue({ role: "CUSTOMER_SERVICE", scope: "unassigned", assigneeId: "sla-cs", search: overdueTicket.ticketNumber });
  assert.equal(csQueue.total, 1);
  const tsQueue = await ticketModel.listQueue({ role: "TRUST_AND_SAFETY", scope: "unassigned", status: "ESCALATED", search: overdueTicket.ticketNumber });
  assert.equal(tsQueue.total, 0);

  const untouched = await ticketModel.findById(notYetDueTicket.id);
  assert.equal(untouched.status, "NEW");

  // A repeated scan records no duplicate breach and changes no workflow state.
  await slaMonitor.runOnce();
  const afterSecond = await ticketModel.findById(overdueTicket.id);
  assert.equal(afterSecond.status, "NEW");
  assert.equal(afterSecond.escalatedAt, null);

  const auditRows = await prisma.ticketAuditLog.findMany({
    where: { ticketId: overdueTicket.id, action: "SLA_BREACH" },
  });
  assert.equal(auditRows.length, 1);
  assert.equal(await prisma.ticketAuditLog.count({ where: { ticketId: overdueTicket.id, action: "ESCALATE" } }), 0);
  const chat = require("../src/services/chatClient");
  t.mock.method(chat, "sendNotification", async () => ({}));
  t.mock.method(chat, "createSupportConversation", async () => ({ id: `sla-room-${overdueTicket.id}` }));
  t.mock.method(chat, "addParticipantToConversation", async () => ({}));
  t.mock.method(chat, "sendTicketMessage", async (_room, data) => ({ id: "sla-reply", ...data, createdAt: new Date() }));
  const service = require("../src/features/tickets/ticketService");
  const assigned = await service.assignToSelf({ ticketId: overdueTicket.id, userId: "sla-cs", role: "CUSTOMER_SERVICE" });
  assert.equal(assigned.status, "ASSIGNED");
  assert.equal(assigned.chatResponderId, "sla-cs");
  await ticketModel.markOverdue(overdueTicket.id, new Date(Date.now() + 86400000));
  const stillAssigned = await ticketModel.findById(overdueTicket.id);
  assert.equal(stillAssigned.status, "ASSIGNED");
  assert.equal(stillAssigned.assigneeId, "sla-cs");
  const reply = await service.reply({ ticketId: overdueTicket.id, userId: "sla-cs", role: "CUSTOMER_SERVICE", body: "CS can still answer" });
  assert.equal(reply.body, "CS can still answer");
});
