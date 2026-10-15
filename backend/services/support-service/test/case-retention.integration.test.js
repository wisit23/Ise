const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../src/models/prismaClient");
const { Prisma } = require("../src/generated/prisma-client");
const model = require("../src/features/tickets/ticketModel");
const service = require("../src/features/tickets/ticketService");
const { sweepCaseRetention } = require("@reloop/shared/src/caseRetention");

test("closed tickets archive and soft delete from the closure timestamp while evidence remains", async (t) => {
  const raw = process.env.DATABASE_URL_SUPPORT;
  if (
    !raw ||
    !["127.0.0.1", "localhost"].includes(new URL(raw).hostname) ||
    !/^\/reloop_ci_[a-z0-9_]+$/.test(new URL(raw).pathname)
  ) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Disposable DATABASE_URL_SUPPORT required");
    t.skip("Set disposable DATABASE_URL_SUPPORT");
    return;
  }
  const created = new Date("2024-01-01T00:00:00Z"),
    closed = new Date("2025-01-01T00:00:00Z");
  const ticket = await model.create({
    requesterId: "retention-buyer",
    assigneeId: "retention-cs",
    subject: "Retention test",
    category: "OTHER",
    priority: "NORMAL",
    status: "CLOSED",
    createdAt: created,
    closedAt: closed,
  });
  t.after(async () => {
    await prisma.supportTicket.delete({ where: { id: ticket.id } });
    await prisma.$disconnect();
  });
  assert.equal(ticket.closedAt.toISOString(), closed.toISOString());
  await sweepCaseRetention(
    prisma,
    Prisma,
    "tickets",
    new Date("2025-04-01T00:00:00Z"),
  );
  const archived = await model.listQueue({
    role: "ADMIN",
    scope: "all",
    search: ticket.ticketNumber,
    retention: "archived",
  });
  assert.equal(archived.items.length, 1);
  assert.equal(
    (
      await model.listQueue({
        role: "ADMIN",
        scope: "all",
        search: ticket.ticketNumber,
      })
    ).items.length,
    0,
  );
  await sweepCaseRetention(
    prisma,
    Prisma,
    "tickets",
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.ok((await model.findById(ticket.id)).deletedAt);
  assert.ok(
    await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } }),
    "history is preserved",
  );
  assert.equal(
    (await model.listByRequester("retention-buyer")).items.length,
    0,
  );
  assert.equal(
    (
      await model.listQueue({
        role: "ADMIN",
        scope: "all",
        search: ticket.ticketNumber,
        retention: "deleted",
      })
    ).items.length,
    1,
  );
  await assert.rejects(
    service.getTicket({
      ticketId: ticket.id,
      userId: "retention-buyer",
      role: "BUYER",
    }),
    { status: 404 },
  );
});
