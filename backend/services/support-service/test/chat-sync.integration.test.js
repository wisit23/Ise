const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL;
const AUTH_PUBLIC_URL = process.env.AUTH_PUBLIC_URL;

async function login(email) {
  const response = await fetch(`${AUTH_PUBLIC_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

test("SUPPORT chat message updates ticket first-response and audit exactly once", async (t) => {
  if (!CHAT_SERVICE_URL || !AUTH_PUBLIC_URL) {
    t.skip(
      "CHAT_SERVICE_URL and AUTH_PUBLIC_URL are required for the cross-service test",
    );
    return;
  }

  const requesterSession = await login("buyer.demo@example.com");
  const agentSession = await login("cs.nan@example.com");
  const agentId = agentSession.user.id;
  const requesterToken = requesterSession.accessToken;
  const agentToken = agentSession.accessToken;

  const create = await request(app)
    .post("/tickets")
    .set("Authorization", `Bearer ${requesterToken}`)
    .send({ subject: "cross-service sync", category: "TECHNICAL" });
  assert.equal(create.status, 201);
  assert.ok(create.body.conversationId);

  const assign = await request(app)
    .post(`/tickets/${create.body.id}/assign`)
    .set("Authorization", `Bearer ${agentToken}`);
  assert.equal(assign.status, 200);

  const sent = await fetch(
    `${CHAT_SERVICE_URL}/conversations/${create.body.conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({ body: "ตอบจาก live support" }),
    },
  );
  assert.equal(sent.status, 201);
  const chatMessage = await sent.json();

  const synced = await waitFor(async () => {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: create.body.id },
      include: { messages: true, auditLog: true },
    });
    return ticket?.messages.some((m) => m.chatMessageId === chatMessage.id)
      ? ticket
      : null;
  });

  assert.ok(synced, "chat message was not mirrored into support-service");
  assert.ok(synced.firstResponseAt);
  assert.equal(
    synced.messages.filter((m) => m.chatMessageId === chatMessage.id).length,
    1,
  );
  assert.equal(
    synced.auditLog.filter(
      (row) => row.action === "REPLY" && row.actorId === agentId,
    ).length,
    1,
  );
});
