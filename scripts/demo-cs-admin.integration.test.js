const test = require("node:test");
const assert = require("node:assert/strict");

test("CS/Admin demo seed uses normalized stores and ordered historical assignments", {
  skip: process.env.DEMO_ER_REHEARSAL !== "1",
  timeout: 120000,
}, async (t) => {
  const endpoints = {};
  for (const service of ["auth", "order", "support", "chat"]) {
    const raw = process.env[`DATABASE_URL_${service.toUpperCase()}`];
    const parsed = new URL(raw);
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.port, service === "chat" ? "55441" : "55439");
    assert.equal(parsed.pathname, service === "chat" ? "/chat_er_live" : `/${service}_live_er`);
    if (service === "chat") assert.equal(parsed.searchParams.get("replicaSet"), "er-rehearsal");
    endpoints[service] = raw;
  }
  process.env.DATABASE_URL = endpoints.auth;
  const { PrismaClient: AuthClient } = require("@prisma/client");
  const { PrismaClient: OrderClient } = require("../backend/services/order-service/src/generated/prisma-client");
  const { PrismaClient: SupportClient } = require("../backend/services/support-service/src/generated/prisma-client");
  const { PrismaClient: ChatClient } = require("../backend/services/chat-service/src/generated/prisma-client");
  const rawOrder = new OrderClient({ datasources: { db: { url: endpoints.order } } });
  const clients = {
    auth: new AuthClient({ datasources: { db: { url: endpoints.auth } } }),
    order: require("../backend/services/order-service/src/models/erClient").wrapClient(rawOrder),
    support: new SupportClient({ datasources: { db: { url: endpoints.support } } }),
    chat: new ChatClient({ datasources: { db: { url: endpoints.chat } } }),
  };
  const { seedFixtures, resetFixtures, verifyFixtures, ID } = require("./demo-cs-admin");
  t.after(async () => {
    try { await resetFixtures(clients); }
    finally { await Promise.all(Object.values(clients).map(client => client.$disconnect())); }
  });
  // Reset only this demo's known IDs, never the full CS/Admin database.
  await resetFixtures(clients);
  await seedFixtures(clients);
  await verifyFixtures(clients);
  const assignments = await clients.support.ticketAssignment.findMany({
    where: { ticketId: { in: ID.tickets } },
  });
  assert.equal(assignments.length, 3);
  assert.ok(assignments.every(row => !row.endedAt || +row.endedAt >= +row.assignedAt));
  const closed = await clients.support.supportTicket.findUnique({
    where: { id: ID.tickets[3] }, include: { currentStatus: true },
  });
  assert.equal(closed.currentStatus.code, "CLOSED");
});
