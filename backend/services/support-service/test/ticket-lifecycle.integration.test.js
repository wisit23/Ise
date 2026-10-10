// Integration test against a real, disposable Postgres database
// (reloop_support). Skips cleanly when DATABASE_URL is unset/unreachable so
// `npm test` still passes on a machine with no database configured. Set
// REQUIRE_INTEGRATION=1 (the CI workflow does) to turn that skip into a hard
// failure instead — see product-service/test/product-crud.integration.test.js
// for the pattern this follows.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_SUPPORT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

const requesterId = `int-test-requester-${Date.now()}`;
const agentAId = `int-test-agent-a-${Date.now()}`;
const agentBId = `int-test-agent-b-${Date.now()}`;
const strangerId = `int-test-stranger-${Date.now()}`;

const requesterToken = signAccessToken({ sub: requesterId, role: "BUYER" });
const agentAToken = signAccessToken({
  sub: agentAId,
  role: "CUSTOMER_SERVICE",
});
const agentBToken = signAccessToken({
  sub: agentBId,
  role: "CUSTOMER_SERVICE",
});
const strangerToken = signAccessToken({ sub: strangerId, role: "BUYER" });

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("support ticket lifecycle against a real database", async (t) => {
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

  // Create as the requester.
  const createRes = await request(app)
    .post("/tickets")
    .set("Authorization", `Bearer ${requesterToken}`)
    .send({ subject: "สินค้าไม่ถึงตามกำหนด", category: "ORDER" });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.status, "NEW");
  assert.match(createRes.body.ticketNumber, /^#CS-\d{6}$/);
  const id = createRes.body.id;

  // A stranger (not the requester, not an agent on an unassigned ticket... wait, unassigned tickets ARE visible to any agent, but not to a random BUYER stranger).
  const strangerRes = await request(app)
    .get(`/tickets/${id}`)
    .set("Authorization", `Bearer ${strangerToken}`);
  assert.equal(strangerRes.status, 403);

  // Any agent can view an unassigned ticket (to decide whether to pick it up).
  const preAssignView = await request(app)
    .get(`/tickets/${id}`)
    .set("Authorization", `Bearer ${agentAToken}`);
  assert.equal(preAssignView.status, 200);

  // Agent A assigns it to themself.
  const assignRes = await request(app)
    .post(`/tickets/${id}/assign`)
    .set("Authorization", `Bearer ${agentAToken}`);
  assert.equal(assignRes.status, 200);
  assert.equal(assignRes.body.assigneeId, agentAId);
  assert.equal(assignRes.body.status, "ASSIGNED");

  // Agent B can no longer pick up the same ticket (already assigned).
  const doubleAssignRes = await request(app)
    .post(`/tickets/${id}/assign`)
    .set("Authorization", `Bearer ${agentBToken}`);
  assert.equal(doubleAssignRes.status, 409);

  // Agent B (not the assignee) can no longer view it either.
  const agentBView = await request(app)
    .get(`/tickets/${id}`)
    .set("Authorization", `Bearer ${agentBToken}`);
  assert.equal(agentBView.status, 403);

  // Trust & Safety staff CAN view it even when not assigned (escalation/oversight authority).
  const safetyToken = signAccessToken({
    sub: `safety-${Date.now()}`,
    role: "TRUST_AND_SAFETY",
  });
  const safetyView = await request(app)
    .get(`/tickets/${id}`)
    .set("Authorization", `Bearer ${safetyToken}`);
  assert.equal(safetyView.status, 200);

  // Agent A moves it to IN_PROGRESS.
  const inProgressRes = await request(app)
    .patch(`/tickets/${id}/status`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ status: "IN_PROGRESS", version: assignRes.body.version });
  assert.equal(inProgressRes.status, 200);

  // Invalid transition (IN_PROGRESS -> ASSIGNED is not a valid edge).
  const invalidTransitionRes = await request(app)
    .patch(`/tickets/${id}/status`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ status: "ASSIGNED", version: inProgressRes.body.version });
  assert.equal(invalidTransitionRes.status, 400);

  // Agent A adds an internal note.
  const internalNoteRes = await request(app)
    .post(`/tickets/${id}/messages`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ body: "โน้ตภายใน: รอตรวจสอบสต๊อก", isInternal: true });
  assert.equal(internalNoteRes.status, 201);

  // Agent A replies visibly.
  const replyRes = await request(app)
    .post(`/tickets/${id}/messages`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ body: "กำลังตรวจสอบให้อยู่ครับ" });
  assert.equal(replyRes.status, 201);

  // A requester cannot post an internal note (isInternal is silently ignored, not rejected — treated as a normal reply for them).
  const requesterCannotInternal = await request(app)
    .post(`/tickets/${id}/messages`)
    .set("Authorization", `Bearer ${requesterToken}`)
    .send({ body: "ขอบคุณครับ", isInternal: true });
  assert.equal(requesterCannotInternal.status, 201);

  // The requester's own view must never include the internal note.
  const requesterView = await request(app)
    .get(`/tickets/${id}`)
    .set("Authorization", `Bearer ${requesterToken}`);
  assert.equal(requesterView.status, 200);
  assert.equal(
    requesterView.body.messages.some((m) => m.isInternal),
    false,
  );
  assert.equal(
    requesterView.body.messages.some((m) => m.body.includes("โน้ตภายใน")),
    false,
  );

  // The agent's view does include the internal note.
  const agentView = await request(app)
    .get(`/tickets/${id}`)
    .set("Authorization", `Bearer ${agentAToken}`);
  assert.equal(
    agentView.body.messages.some((m) => m.isInternal),
    true,
  );

  // Wait for customer input, resume, then resolve and close.
  const pendingRes = await request(app)
    .patch(`/tickets/${id}/status`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ status: "PENDING_USER", version: agentView.body.version });
  assert.equal(pendingRes.status, 200);

  const staleVersionRes = await request(app)
    .patch(`/tickets/${id}/status`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ status: "RESOLVED", version: agentView.body.version });
  assert.equal(staleVersionRes.status, 409);

  const resumeRes = await request(app)
    .patch(`/tickets/${id}/status`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ status: "IN_PROGRESS", version: pendingRes.body.version });
  assert.equal(resumeRes.status, 200);

  const resolveRes = await request(app)
    .patch(`/tickets/${id}/status`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ status: "RESOLVED", version: resumeRes.body.version });
  assert.equal(resolveRes.status, 200);
  assert.ok(resolveRes.body.resolvedAt);

  const closeRes = await request(app)
    .patch(`/tickets/${id}/status`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ status: "CLOSED", version: resolveRes.body.version });
  assert.equal(closeRes.status, 200);
  assert.ok(closeRes.body.closedAt);

  // Cannot reply to a closed ticket.
  const replyToClosedRes = await request(app)
    .post(`/tickets/${id}/messages`)
    .set("Authorization", `Bearer ${requesterToken}`)
    .send({ body: "ยังอยู่ไหมครับ" });
  assert.equal(replyToClosedRes.status, 400);

  // Every transition/assign/reply left an audit trail.
  const auditRows = await prisma.ticketAuditLog.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "asc" },
  });
  const actions = auditRows.map((r) => r.action);
  assert.ok(actions.includes("ASSIGN"));
  assert.ok(actions.filter((a) => a === "STATUS_CHANGE").length >= 4); // NEW, IN_PROGRESS, RESOLVED, CLOSED
  assert.ok(actions.includes("REPLY"));

  // requester's own ticket list includes it.
  const mineRes = await request(app)
    .get("/tickets/mine")
    .set("Authorization", `Bearer ${requesterToken}`);
  assert.equal(mineRes.status, 200);
  assert.ok(mineRes.body.items.some((t) => t.id === id));

  // A BUYER cannot view the agent queue.
  const buyerQueueRes = await request(app)
    .get("/tickets/queue")
    .set("Authorization", `Bearer ${requesterToken}`);
  assert.equal(buyerQueueRes.status, 403);

  const dashboardRes = await request(app)
    .get("/tickets/dashboard?days=8")
    .set("Authorization", `Bearer ${safetyToken}`);
  assert.equal(dashboardRes.status, 200);
  assert.ok(dashboardRes.body.total >= 1);
  assert.equal(dashboardRes.body.trend.length, 8);
});

test("Trust & Safety can take over an escalated ticket with versioned handoff audit", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip("database unreachable");
    return;
  }
  const safetyId = `int-test-safety-${Date.now()}`;
  const safetyToken = signAccessToken({ sub: safetyId, role: "TRUST_AND_SAFETY" });
  const created = await request(app)
    .post("/tickets")
    .set("Authorization", `Bearer ${requesterToken}`)
    .send({ subject: "เคสส่งต่อเพื่อทดสอบ takeover", category: "OTHER" });
  const assigned = await request(app)
    .post(`/tickets/${created.body.id}/assign`)
    .set("Authorization", `Bearer ${agentAToken}`);
  const escalated = await request(app)
    .patch(`/tickets/${created.body.id}/status`)
    .set("Authorization", `Bearer ${agentAToken}`)
    .send({ status: "ESCALATED", version: assigned.body.version, reason: "safety review" });
  assert.equal(escalated.status, 200);

  const takeover = await request(app)
    .post(`/tickets/${created.body.id}/takeover`)
    .set("Authorization", `Bearer ${safetyToken}`)
    .send({ version: escalated.body.version, reason: "accepted by T&S" });
  assert.equal(takeover.status, 200);
  assert.equal(takeover.body.assigneeId, safetyId);

  const handoff = await prisma.ticketAuditLog.findFirst({
    where: { ticketId: created.body.id, action: "HANDOFF", actorId: safetyId },
  });
  assert.equal(handoff.fromValue, agentAId);
  assert.equal(handoff.toValue, safetyId);
});
