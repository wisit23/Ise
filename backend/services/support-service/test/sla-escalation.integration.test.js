const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_SUPPORT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
}

const prisma = require("../src/models/prismaClient");
const slaMonitor = require("../src/features/sla/slaMonitor");

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("sla monitor escalates overdue tickets exactly once, even run twice", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_SUPPORT not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/support-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const overdueTicket = await prisma.supportTicket.create({
    data: {
      ticketNumber: `#CS-${Date.now().toString().slice(-6)}`,
      requesterId: "int-test-sla-requester",
      subject: "overdue test ticket",
      category: "OTHER",
      status: "NEW",
      priority: "NORMAL",
      slaDueAt: new Date(Date.now() - 60_000), // already overdue
    },
  });
  const notYetDueTicket = await prisma.supportTicket.create({
    data: {
      ticketNumber: `#CS-${(Date.now() + 1).toString().slice(-6)}`,
      requesterId: "int-test-sla-requester",
      subject: "not due yet",
      category: "OTHER",
      status: "NEW",
      priority: "NORMAL",
      slaDueAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const escalatedFirstRun = await slaMonitor.runOnce();
  assert.ok(escalatedFirstRun >= 1);

  const afterFirst = await prisma.supportTicket.findUnique({
    where: { id: overdueTicket.id },
  });
  assert.equal(afterFirst.status, "ESCALATED");
  assert.ok(afterFirst.escalatedAt);
  const firstEscalatedAt = afterFirst.escalatedAt.getTime();

  const untouched = await prisma.supportTicket.findUnique({
    where: { id: notYetDueTicket.id },
  });
  assert.equal(untouched.status, "NEW");

  // Running again must not re-escalate or change escalatedAt.
  await slaMonitor.runOnce();
  const afterSecond = await prisma.supportTicket.findUnique({
    where: { id: overdueTicket.id },
  });
  assert.equal(afterSecond.escalatedAt.getTime(), firstEscalatedAt);

  const auditRows = await prisma.ticketAuditLog.findMany({
    where: { ticketId: overdueTicket.id, action: "ESCALATE" },
  });
  assert.equal(auditRows.length, 1);
});
