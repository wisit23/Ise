const test = require("node:test");
const assert = require("node:assert/strict");

// The module-level client must never be used: point it at an unreachable port so a
// call that ignores the injected client fails instead of silently using another database.
const realUrl = process.env.DATABASE_URL_SUPPORT;
process.env.DATABASE_URL_SUPPORT = "postgresql://unused:unused@127.0.0.1:1/unused";
const { PrismaClient } = require("../src/generated/prisma-client");
const model = require("../src/features/tickets/ticketModel");

test("explicit client and assignedAt keep a back-dated assign + close valid", async (t) => {
  if (!realUrl) return t.skip("Set disposable DATABASE_URL_SUPPORT");
  const client = new PrismaClient({ datasources: { db: { url: realUrl } } });
  t.after(() => client.$disconnect());
  const day = 86400000;
  const created = new Date(Date.now() - 3 * day);
  const assignedAt = new Date(Date.now() - 2 * day);
  const closedAt = new Date(Date.now() - 0.5 * day);
  const ticket = await model.create(
    { requesterId: "hist-buyer", subject: "historical assign", category: "OTHER", createdAt: created },
    client,
  );
  t.after(() => client.supportTicket.delete({ where: { id: ticket.id } }));

  assert.equal(await model.assign({ id: ticket.id, version: 0, assigneeId: "hist-agent", assignedAt }, client), true);
  assert.equal(
    await model.transitionStatus({ id: ticket.id, version: 1, status: "CLOSED", actorId: "hist-agent", at: closedAt }, client),
    true,
  );

  const [assignment] = await client.ticketAssignment.findMany({ where: { ticketId: ticket.id } });
  assert.equal(+assignment.assignedAt, +assignedAt);
  assert.equal(+assignment.endedAt, +closedAt);
  const history = await client.ticketStatusHistory.findMany({
    where: { ticketId: ticket.id, toStatus: { code: "ASSIGNED" } },
  });
  assert.equal(+history[0].createdAt, +assignedAt);
});

test("without assignedAt the assignment keeps using the current time", async (t) => {
  if (!realUrl) return t.skip("Set disposable DATABASE_URL_SUPPORT");
  const client = new PrismaClient({ datasources: { db: { url: realUrl } } });
  t.after(() => client.$disconnect());
  const ticket = await model.create({ requesterId: "hist-buyer", subject: "now assign", category: "OTHER" }, client);
  t.after(() => client.supportTicket.delete({ where: { id: ticket.id } }));
  const before = Date.now();
  assert.equal(await model.assign({ id: ticket.id, version: 0, assigneeId: "hist-agent" }, client), true);
  const [assignment] = await client.ticketAssignment.findMany({ where: { ticketId: ticket.id } });
  assert.ok(+assignment.assignedAt >= before - 1000 && +assignment.assignedAt <= Date.now() + 1000);
});

test("old demo order (assign now, close 12h ago) violates assignment_time_window", async (t) => {
  if (!realUrl) return t.skip("Set disposable DATABASE_URL_SUPPORT");
  const client = new PrismaClient({ datasources: { db: { url: realUrl } } });
  t.after(() => client.$disconnect());
  const ticket = await model.create({ requesterId: "hist-buyer", subject: "regression", category: "OTHER" }, client);
  t.after(() => client.supportTicket.delete({ where: { id: ticket.id } }));
  await model.assign({ id: ticket.id, version: 0, assigneeId: "hist-agent" }, client);
  await assert.rejects(
    model.transitionStatus({ id: ticket.id, version: 1, status: "CLOSED", at: new Date(Date.now() - 43200000) }, client),
    /assignment_time_window/,
  );
});
