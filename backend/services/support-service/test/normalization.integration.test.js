const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_SUPPORT)
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
const prisma = require("../src/models/prismaClient");
const model = require("../src/features/tickets/ticketModel");
const app = require("../src/app");
const { signAccessToken } = require("@reloop/shared");
app.locals.validateAccessSession = async () => {};
const agent = signAccessToken({
  sub: "normalized-agent",
  role: "CUSTOMER_SERVICE",
});

async function ready(t) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw error;
    t.skip("Run migrations and seed on a disposable DATABASE_URL_SUPPORT");
    return false;
  }
}
async function createTicket(t, extra = {}) {
  const ticket = await model.create({
    requesterId: "normalized-buyer",
    subject: "Normalization integration",
    category: "OTHER",
    ...extra,
  });
  t.after(() => prisma.supportTicket.delete({ where: { id: ticket.id } }));
  return ticket;
}

test("normalized ticket claim, history and message SLA survive the existing API shape", async (t) => {
  if (!(await ready(t))) return;
  const ticket = await createTicket(t);
  assert.equal(ticket.status, "NEW");
  assert.equal(ticket.assigneeId, null);
  assert.equal(
    await prisma.ticketSlaTarget.count({ where: { ticketId: ticket.id } }),
    2,
  );
  const claims = await Promise.all([
    model.assign({ id: ticket.id, version: 0, assigneeId: "agent-a" }),
    model.assign({ id: ticket.id, version: 0, assigneeId: "agent-b" }),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(
    await prisma.ticketAssignment.count({
      where: { ticketId: ticket.id, endedAt: null },
    }),
    1,
  );
  const claimed = await model.findById(ticket.id);
  const version = claimed.version;
  assert.equal(
    await model.transitionStatus({
      id: ticket.id,
      version: version - 1,
      status: "IN_PROGRESS",
    }),
    false,
  );
  assert.equal(
    await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } }),
    2,
  );
  await model.recordChatMessage({
    chatMessageId: "internal-" + ticket.id,
    ticketId: ticket.id,
    authorId: "agent-a",
    authorRole: "AGENT",
    body: "internal",
    isInternal: true,
  });
  assert.equal((await model.findById(ticket.id)).firstResponseAt, null);
  const reply = await model.recordChatMessage({
    chatMessageId: "public-" + ticket.id,
    ticketId: ticket.id,
    authorId: "agent-a",
    authorRole: "AGENT",
    body: "public",
    isInternal: false,
  });
  assert.equal(
    +(await model.findById(ticket.id)).firstResponseAt,
    +reply.event.createdAt,
  );
  assert.equal(
    await model.transitionStatus({
      id: ticket.id,
      version,
      status: "IN_PROGRESS",
      actorId: claimed.assigneeId,
    }),
    true,
  );
  const current = await model.findById(ticket.id);
  assert.equal(current.status, "IN_PROGRESS");
  const queue = await model.listQueue({
    role: "ADMIN",
    scope: "all",
    search: ticket.ticketNumber,
  });
  assert.equal(queue.items[0].id, ticket.id);
  await model.transitionStatus({
    id: ticket.id,
    version: current.version,
    status: "RESOLVED",
    actorId: current.assigneeId,
  });
  const resolved = await model.findById(ticket.id);
  await model.transitionStatus({
    id: ticket.id,
    version: resolved.version,
    status: "CLOSED",
    actorId: current.assigneeId,
  });
  const closed = await model.findById(ticket.id);
  assert.equal(closed.assigneeId, current.assigneeId);
  assert.equal(
    await prisma.ticketAssignment.count({
      where: { ticketId: ticket.id, endedAt: null },
    }),
    0,
  );
  const otherAgent = current.assigneeId === "agent-a" ? "agent-b" : "agent-a";
  await assert.rejects(
    require("../src/features/tickets/ticketService").getTicket({
      ticketId: ticket.id,
      userId: otherAgent,
      role: "CUSTOMER_SERVICE",
    }),
    { status: 403 },
  );
  const otherQueue = await model.listQueue({
    role: "CUSTOMER_SERVICE",
    scope: "all",
    assigneeId: otherAgent,
    search: ticket.ticketNumber,
  });
  assert.equal(otherQueue.items.length, 0);
});

test("reopened case receives a new resolution SLA cycle without deleting the previous result", async (t) => {
  if (!(await ready(t))) return;
  const ticket = await createTicket(t);
  await model.assign({
    id: ticket.id,
    version: 0,
    assigneeId: "normalized-agent",
  });
  await model.recordChatMessage({
    chatMessageId: "reply-" + ticket.id,
    ticketId: ticket.id,
    authorId: "normalized-agent",
    authorRole: "AGENT",
    body: "reply",
    isInternal: false,
  });
  await model.transitionStatus({
    id: ticket.id,
    version: 1,
    status: "IN_PROGRESS",
    actorId: "normalized-agent",
  });
  await model.transitionStatus({
    id: ticket.id,
    version: 2,
    status: "RESOLVED",
    actorId: "normalized-agent",
  });
  const achieved = await prisma.ticketSlaTarget.findFirst({
    where: { ticketId: ticket.id, metricType: "RESOLUTION", cycle: 1 },
  });
  assert.ok(achieved.achievedAt);
  await model.transitionStatus({
    id: ticket.id,
    version: 3,
    status: "IN_PROGRESS",
    actorId: "normalized-agent",
  });
  const cycles = await prisma.ticketSlaTarget.findMany({
    where: { ticketId: ticket.id, metricType: "RESOLUTION" },
    orderBy: { cycle: "asc" },
  });
  assert.equal(cycles.length, 2);
  assert.ok(cycles[0].achievedAt);
  assert.equal(cycles[1].achievedAt, null);
  const latest = await model.findById(ticket.id);
  assert.equal(+latest.slaDueAt, +cycles[1].dueAt);
});

test("chat link and metadata-event uniqueness reject cross-ticket correlation", async (t) => {
  if (!(await ready(t))) return;
  const first = await createTicket(t);
  const second = await createTicket(t);
  const room = "normalized-room-" + first.id;
  await model.setConversationId(first.id, room);
  await model.setConversationId(first.id, room);
  await assert.rejects(model.setConversationId(first.id, room + "-other"), {
    status: 409,
  });
  await assert.rejects(model.setConversationId(second.id, room), {
    status: 409,
  });
  const input = {
    ticketId: first.id,
    conversationId: room,
    chatMessageId: "normalized-msg-" + first.id,
    authorId: "normalized-agent",
    authorRole: "AGENT",
    body: "mirrored",
  };
  assert.equal((await model.recordChatMessage(input)).alreadyRecorded, false);
  assert.equal((await model.recordChatMessage(input)).alreadyRecorded, true);
  await assert.rejects(
    model.recordChatMessage({
      ...input,
      ticketId: second.id,
      conversationId: undefined,
    }),
    { status: 400 },
  );
  assert.equal(
    await prisma.ticketMessage.count({
      where: { chatMessageId: input.chatMessageId },
    }),
    0,
  );
  assert.equal(
    await prisma.ticketAuditLog.count({
      where: { ticketId: first.id, action: "REPLY" },
    }),
    1,
  );
});

test("draft revision never changes the published FAQ until that revision is published", async (t) => {
  if (!(await ready(t))) return;
  const word = "normalizedfaq" + Date.now();
  const make = (title) =>
    request(app)
      .post("/help")
      .set("Authorization", "Bearer " + agent)
      .send({ title, body: "Published answer", category: "OTHER" });
  const created = await make(word);
  assert.equal(created.status, 201);
  const id = created.body.id;
  t.after(() => prisma.helpArticle.delete({ where: { id } }));
  assert.equal(
    (
      await request(app)
        .patch("/help/" + id + "/publish")
        .set("Authorization", "Bearer " + agent)
    ).status,
    200,
  );
  const revised = await request(app)
    .post("/help/" + id + "/revisions")
    .set("Authorization", "Bearer " + agent)
    .send({ title: word, body: "New draft answer", category: "OTHER" });
  assert.equal(revised.status, 201);
  assert.equal(revised.body.version, 2);
  assert.equal(revised.body.hasUnpublishedChanges, true);
  const publicRows = (await request(app).get("/help").query({ q: word })).body
    .items;
  assert.equal(publicRows.find((r) => r.id === id).body, "Published answer");
  assert.equal(
    (
      await request(app)
        .patch("/help/" + id + "/publish")
        .set("Authorization", "Bearer " + agent)
        .send({ version: 999 })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .patch("/help/" + id + "/publish")
        .set("Authorization", "Bearer " + agent)
        .send({ version: 2 })
    ).status,
    200,
  );
  const after = (await request(app).get("/help").query({ q: word })).body.items;
  assert.equal(after.find((r) => r.id === id).body, "New draft answer");
  assert.equal(
    await prisma.helpArticleRevision.count({ where: { articleId: id } }),
    2,
  );
  await assert.rejects(
    prisma.helpArticle.update({
      where: { id },
      data: { publishedVersion: 999 },
    }),
    { code: "P2003" },
  );
});

test("category-specific SLA takes precedence and tickets retain their policy snapshot", async (t) => {
  if (!(await ready(t))) return;
  const category = await prisma.ticketCategory.findUnique({
    where: { code: "OTHER" },
  });
  const priority = await prisma.ticketPriority.findUnique({
    where: { code: "NORMAL" },
  });
  const policy = await prisma.slaPolicy.create({
    data: {
      categoryId: category.id,
      priorityId: priority.id,
      firstResponseMinutes: 2,
      resolutionMinutes: 10,
      effectiveFrom: new Date(Date.now() - 10000),
    },
  });
  const ticket = await model.create({
    requesterId: "normalized-buyer",
    subject: "policy snapshot",
    category: "OTHER",
  });
  t.after(async () => {
    await prisma.supportTicket.delete({ where: { id: ticket.id } });
    await prisma.slaPolicy.delete({ where: { id: policy.id } });
  });
  const targets = await prisma.ticketSlaTarget.findMany({
    where: { ticketId: ticket.id },
  });
  assert.ok(targets.every((r) => r.policyId === policy.id));
  assert.equal(
    +targets.find((r) => r.metricType === "FIRST_RESPONSE").dueAt -
      +ticket.createdAt,
    120000,
  );
  await prisma.slaPolicy.update({
    where: { id: policy.id },
    data: { effectiveTo: new Date() },
  });
  assert.equal(
    (
      await prisma.ticketSlaTarget.findMany({ where: { ticketId: ticket.id } })
    )[0].policyId,
    policy.id,
  );
});

test("failed history write rolls back the status snapshot and version", async (t) => {
  if (!(await ready(t))) return;
  const ticket = await createTicket(t);
  const before = await prisma.ticketStatusHistory.count({
    where: { ticketId: ticket.id },
  });
  await assert.rejects(
    model.transitionStatus({
      id: ticket.id,
      version: 0,
      status: "ESCALATED",
      actorId: null,
    }),
  );
  const after = await model.findById(ticket.id);
  assert.equal(after.status, "NEW");
  assert.equal(after.version, 0);
  assert.equal(
    await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } }),
    before,
  );
});

test("concurrent FAQ edits create distinct immutable revision numbers", async (t) => {
  if (!(await ready(t))) return;
  const helpModel = require("../src/features/help-content/helpModel");
  const article = await helpModel.create({
    slug: "concurrent-revisions-" + Date.now(),
    title: "Original",
    body: "Original",
    category: "OTHER",
    authorId: "normalized-agent",
  });
  t.after(() => prisma.helpArticle.delete({ where: { id: article.id } }));
  const results = await Promise.all(
    ["Edit A", "Edit B"].map((body) =>
      helpModel.revise({
        id: article.id,
        title: "Edited",
        body,
        category: "OTHER",
        authorId: "normalized-agent",
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.version).sort(), [2, 3]);
  const revisions = await prisma.helpArticleRevision.findMany({
    where: { articleId: article.id },
    orderBy: { version: "asc" },
  });
  assert.equal(revisions[0].body, "Original");
  assert.deepEqual(
    revisions
      .slice(1)
      .map((r) => r.body)
      .sort(),
    ["Edit A", "Edit B"],
  );
});
