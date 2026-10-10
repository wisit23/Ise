const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const access = require("../conversations/conversationService");
const messages = require("../messages/messageModel");
const sync = require("../sync/supportSyncWorker");
const broadcast = require("../../realtime/broadcast");
const handlers = require("./supportMessages");
function stub(t, target, name, fn) {
  const original = target[name];
  target[name] = fn;
  t.after(() => { target[name] = original; });
}

async function invoke(handler, body) {
  let output, error, status;
  await handler({ params: { id: "room" }, body }, { status(code) { status = code; return this; }, json(value) { output = value; } }, (err) => { error = err; });
  return { output, error, status };
}
function mocks(t, { role = "AGENT", status = "ACTIVE", existing = null } = {}) {
  const conversation = { id: "room", contextId: "ticket", contextType: "SUPPORT", status,
    participants: [{ userId: "actor", role }] };
  const writes = [];
  t.mock.method(access, "getForParticipant", async () => conversation);
  stub(t, prisma.conversation, "findUnique", async () => conversation);
  stub(t, prisma.message, "findUnique", async () => existing);
  stub(t, prisma.message, "create", async ({ data }) => { writes.push(data); return data; });
  stub(t, prisma.message, "update", async () => ({}));
  t.mock.method(messages, "createAndTouch", async (data) => { writes.push(data); return { id: "sent", ...data }; });
  t.mock.method(broadcast, "broadcastMessage", () => {});
  t.mock.method(global, "fetch", async () => ({ ok: true }));
  return { writes, conversation };
}
test("support reply derives sender role, persists in Chat and schedules metadata delivery", async (t) => {
  const { writes } = mocks(t);
  const result = await invoke(handlers.reply, { senderId: "actor", senderRole: "SYSTEM", body: " hello ", eventKey: "key" });
  assert.equal(result.status, 201);
  assert.equal(writes[0].senderRole, "AGENT");
  assert.equal(writes[0].body, "hello");
  assert.equal(writes[0].syncStatus, "PENDING");
});
test("buyers cannot create internal notes and locked rooms reject new replies", async (t) => {
  mocks(t, { role: "BUYER", status: "LOCKED" });
  assert.equal((await invoke(handlers.reply, { senderId: "actor", body: "secret", visibility: "INTERNAL" })).error.status, 403);
  assert.equal((await invoke(handlers.reply, { senderId: "actor", body: "reply" })).error.status, 409);
});
test("Admin may add internal notes but never public replies", async (t) => {
  mocks(t, { role: "ADMIN" });
  assert.equal((await invoke(handlers.reply, { senderId: "actor", body: "public" })).error.status, 403);
  assert.equal((await invoke(handlers.reply, { senderId: "actor", body: "note", visibility: "INTERNAL" })).status, 201);
});
test("same idempotency key returns existing message; changed content rejects", async (t) => {
  const { writes } = mocks(t, { existing: { senderId: "actor", body: "hello", visibility: "ALL" } });
  assert.equal((await invoke(handlers.reply, { senderId: "actor", body: "hello", eventKey: "key" })).status, 200);
  assert.equal((await invoke(handlers.reply, { senderId: "actor", body: "changed", eventKey: "key" })).error.status, 409);
  assert.equal(writes.length, 0);
});
test("legacy import preserves time/visibility, validates context and never fabricates missing mirrors", async (t) => {
  const { writes } = mocks(t, { status: "LOCKED" });
  const data = { ticketId: "ticket", sourceId: "old-id", authorId: "actor", authorRole: "AGENT", body: "note", isInternal: true, createdAt: "2020-01-01T00:00:00Z" };
  const result = await invoke(handlers.importMessage, data);
  assert.equal(result.status, 201);
  assert.equal(+writes[0].createdAt, +new Date(data.createdAt));
  assert.equal(writes[0].visibility, "INTERNAL");
  assert.equal((await invoke(handlers.importMessage, { ...data, ticketId: "other" })).error.status, 400);
  assert.equal((await invoke(handlers.importMessage, { ...data, chatMessageId: "a".repeat(24) })).error.status, 409);
});
test("CS event delivery contains no message body or attachment payload", async (t) => {
  mocks(t);
  let event;
  t.mock.method(global, "fetch", async (_url, options) => { event = JSON.parse(options.body); return { ok: true }; });
  await sync.deliverMessage({ id: "room", contextType: "SUPPORT", contextId: "ticket" }, { id: "msg", senderId: "actor", senderRole: "AGENT", body: "private", payload: { url: "secret" }, createdAt: new Date() });
  assert.equal(event.body, undefined);
  assert.equal(event.payload, undefined);
  assert.equal(event.chatMessageId, "msg");
});
