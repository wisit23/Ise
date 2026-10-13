const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");

// Refuse all non-rehearsal targets before importing the generated Prisma client or app.
const databaseUrl = process.env.DATABASE_URL || "";
let target;
try { target = new URL(databaseUrl); } catch { target = null; }
if (!target || target.hostname !== "127.0.0.1" || target.port !== "55441" ||
    target.pathname !== "/chat_er_real" || target.searchParams.get("replicaSet") !== "er-rehearsal" ||
    target.searchParams.get("directConnection") !== "true") {
  if (process.env.CHAT_ER_MONGO_REHEARSAL === "1")
    throw new Error("Refusing Mongo integration test: DATABASE_URL must target only the isolated chat_er_real rehearsal DB on 127.0.0.1:55441");
  test("real MongoDB Support import rehearsal", { skip: "Set the isolated chat_er_real rehearsal URL" }, () => {});
} else {

const prisma = require("../src/models/prismaClient");
const shared = require("@reloop/shared");
const request = require("supertest");
const { keyedId } = require("../src/features/internal/supportMessages");
const broadcast = require("../src/realtime/broadcast");
const supportSyncWorker = require("../src/features/sync/supportSyncWorker");

const hex = () => randomBytes(12).toString("hex");
const roomId = hex();
const contextKey = `SUPPORT:er-rehearsal:${hex()}`;
const originalPreview = "Current preview must survive history import";
const originalPreviewAt = new Date("2026-10-01T12:00:00.000Z");
const ticketId = `ticket-er-${hex()}`;
const token = `test-only-${hex()}`;
const publicEvent = { ticketId, sourceId: `legacy-public-${hex()}`, authorId: `requester-${hex()}`,
  authorRole: "REQUESTER", body: "Historical public message", isInternal: false,
  createdAt: "2020-03-04T05:06:07.123Z" };
const internalEvent = { ticketId, sourceId: `legacy-note-${hex()}`, authorId: `agent-${hex()}`,
  authorRole: "AGENT", body: "Historical internal note", isInternal: true,
  createdAt: "2020-03-05T06:07:08.456Z" };
let app;
let savedFetch;
let savedRequireAuth;
let savedInternalToken;
let syncCalls = 0;
let syncEvents = [];
let failNextSync = false;
let broadcasts = 0;

function postImport(body) {
  return request(app).post(`/internal/conversations/${roomId}/import-support-message`)
    .set("x-internal-token", token).send(body);
}

async function ensureIndexes() {
  await prisma.$runCommandRaw({ createIndexes: "Conversation", indexes: [
    { key: { contextKey: 1 }, name: "contextKey_1", unique: true },
  ] });
  await prisma.$runCommandRaw({ createIndexes: "Message", indexes: [
    { key: { idempotencyKey: 1 }, name: "idempotencyKey_1", unique: true },
  ] });
  const conversations = await prisma.$runCommandRaw({ listIndexes: "Conversation" });
  const messages = await prisma.$runCommandRaw({ listIndexes: "Message" });
  assert.ok(conversations.cursor.firstBatch.some((i) => i.name === "contextKey_1" && i.unique));
  assert.ok(messages.cursor.firstBatch.some((i) => i.name === "idempotencyKey_1" && i.unique));
}

async function setup() {
  await ensureIndexes();
  await prisma.conversation.create({ data: { id: roomId, contextType: "SUPPORT", contextId: ticketId,
    contextKey, createdBy: "er-fixture", status: "LOCKED", lastMessageAt: originalPreviewAt,
    lastMessagePreview: originalPreview, participants: [
      { userId: publicEvent.authorId, role: "BUYER", joinedAt: new Date("2019-01-01Z"), lastReadAt: null, leftAt: null },
      { userId: internalEvent.authorId, role: "AGENT", joinedAt: new Date("2019-01-01Z"), lastReadAt: null, leftAt: null },
    ] } });
  await assert.rejects(prisma.conversation.create({ data: { id: hex(), contextType: "SUPPORT", contextId: ticketId,
    contextKey, createdBy: "duplicate-index-probe" } }), (error) => error.code === "P2002");
  const uniqueMessageKey = `er-index-${hex()}`;
  const indexProbe = { conversationId: roomId, senderId: "index-probe", senderRole: "SYSTEM", body: "index probe",
    type: "TEXT", idempotencyKey: uniqueMessageKey };
  await prisma.message.create({ data: { ...indexProbe, id: hex() } });
  await assert.rejects(prisma.message.create({ data: { ...indexProbe, id: hex() } }), (error) => error.code === "P2002");

  savedFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("/chat-access/")) return { ok: true, json: async () => ({ allowed: true, writable: true }) };
    if (options.headers?.["x-internal-token"] === token) {
      syncCalls++;
      syncEvents.push(JSON.parse(options.body));
      if (failNextSync) { failNextSync = false; return { ok: false, status: 503 }; }
      return { ok: true, json: async () => ({}) };
    }
    throw new Error(`Unexpected external request in isolated integration: ${url}`);
  };
  savedRequireAuth = shared.requireAuth;
  shared.requireAuth = (req, res, next) => {
    const who = req.headers["x-test-user"];
    if (!who) return res.status(401).json({ error: "fixture auth required" });
    req.userId = who;
    next();
  };
  savedInternalToken = process.env.INTERNAL_SERVICE_TOKEN;
  process.env.INTERNAL_SERVICE_TOKEN = token;
  app = require("../src/app");
  await prisma.$runCommandRaw({ ping: 1 });
}

async function cleanup() {
  if (savedRequireAuth) shared.requireAuth = savedRequireAuth;
  if (savedFetch) global.fetch = savedFetch;
  await prisma.message.deleteMany({ where: { conversationId: roomId } });
  await prisma.conversation.deleteMany({ where: { id: roomId } });
  if (savedInternalToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
  else process.env.INTERNAL_SERVICE_TOKEN = savedInternalToken;
  await prisma.$disconnect();
}

test("real MongoDB Support import preserves historical records, uniqueness, privacy and restart durability", { timeout: 60000 }, async (t) => {
  t.after(cleanup);
  await setup();
  const originalBroadcast = broadcast.broadcastMessage;
  broadcast.broadcastMessage = () => { broadcasts++; };
  t.after(() => { broadcast.broadcastMessage = originalBroadcast; });

  const publicResult = await postImport(publicEvent);
  const internalResult = await postImport(internalEvent);
  assert.equal(publicResult.status, 201);
  assert.equal(internalResult.status, 201);
  assert.equal(publicResult.body.senderRole, "BUYER");
  assert.equal(publicResult.body.visibility, "ALL");
  assert.equal(+new Date(publicResult.body.createdAt), +new Date(publicEvent.createdAt));
  assert.equal(internalResult.body.senderRole, "AGENT");
  assert.equal(internalResult.body.visibility, "INTERNAL");
  assert.equal(+new Date(internalResult.body.createdAt), +new Date(internalEvent.createdAt));
  assert.equal(broadcasts, 0);
  assert.equal(syncCalls, 0, "import must not trigger Support delivery inline");
  assert.equal(publicResult.body.syncStatus, "SYNCED");
  assert.ok(publicResult.body.syncedAt);
  const replayResult = await supportSyncWorker.processPendingMessages();
  assert.equal(replayResult.processed, 0);
  assert.deepEqual(syncEvents, [], "imported legacy history must never be replayed to Support");

  const concurrentEvent = { ...publicEvent, sourceId: `legacy-race-${hex()}`, body: "Concurrent retry event" };
  const concurrentCalls = await Promise.all([postImport(concurrentEvent), postImport(concurrentEvent)]);
  assert.deepEqual(concurrentCalls.map((r) => r.status).sort(), [200, 201]);
  assert.equal(await prisma.message.count({ where: { conversationId: roomId, id: keyedId(roomId, `legacy-support:${concurrentEvent.sourceId}`) } }), 1);
  const duplicateCalls = await Promise.all([postImport(publicEvent), postImport(publicEvent)]);
  assert.deepEqual(duplicateCalls.map((r) => r.status).sort(), [200, 200]);
  assert.equal(await prisma.message.count({ where: { conversationId: roomId, id: keyedId(roomId, `legacy-support:${publicEvent.sourceId}`) } }), 1);
  assert.equal((await postImport({ ...publicEvent, body: "changed historical content" })).status, 409);
  assert.equal((await postImport({ ...publicEvent, authorId: "different-author" })).status, 409);
  assert.equal((await postImport({ ...publicEvent, ticketId: `${ticketId}-wrong` })).status, 400);
  assert.equal((await request(app).post(`/internal/conversations/${roomId}/import-support-message`).send(publicEvent)).status, 403);

  const missingMirrorId = hex();
  assert.equal((await postImport({ ...publicEvent, sourceId: `mirror-${hex()}`, chatMessageId: missingMirrorId })).status, 409);
  const richId = hex();
  const richOriginal = await prisma.message.create({ data: { id: richId, conversationId: roomId,
    senderId: internalEvent.authorId, senderRole: "ADMIN", type: "FILE", body: "Edited attachment record",
    payload: { fileName: "evidence.pdf", storageKey: "original/evidence.pdf", edited: true }, visibility: "INTERNAL",
    editedAt: new Date("2020-03-06T07:08:09.000Z"), createdAt: new Date("2020-03-06T07:00:00.000Z"), deletedAt: null,
    syncStatus: "PENDING", syncAttempts: 2, nextRetryAt: new Date("2099-10-01T12:00:00.000Z"), lastSyncError: "existing retry" } });
  const mirrored = await postImport({ ...internalEvent, chatMessageId: richId });
  assert.equal(mirrored.status, 200);
  assert.equal(mirrored.body.senderRole, "ADMIN");
  assert.equal(mirrored.body.type, "FILE");
  assert.deepEqual(mirrored.body.payload, richOriginal.payload);
  assert.equal(+new Date(mirrored.body.editedAt), +richOriginal.editedAt);
  assert.equal(mirrored.body.syncStatus, "PENDING");
  assert.equal(mirrored.body.syncAttempts, 2);
  assert.equal(+new Date(mirrored.body.nextRetryAt), +richOriginal.nextRetryAt);
  assert.equal(mirrored.body.lastSyncError, "existing retry");
  const staffRequesterMirror = await postImport({ ...internalEvent, authorRole: "REQUESTER", chatMessageId: richId });
  assert.equal(staffRequesterMirror.status, 200);
  assert.equal(staffRequesterMirror.body.senderRole, "ADMIN");
  assert.equal((await postImport({ ...internalEvent, authorRole: "REQUESTER", authorId: "wrong-requester", chatMessageId: richId })).status, 409);

  const roomBeforeReads = await prisma.conversation.findUnique({ where: { id: roomId } });
  assert.equal(roomBeforeReads.lastMessagePreview, originalPreview);
  assert.equal(+roomBeforeReads.lastMessageAt, +originalPreviewAt);
  assert.equal(await prisma.message.count({ where: { conversationId: roomId, visibility: "INTERNAL" } }), 2);

  const authHeaders = (user) => ({ "x-test-user": user });
  const requesterResponse = await request(app).get(`/conversations/${roomId}/messages`).set(authHeaders(publicEvent.authorId));
  assert.equal(requesterResponse.status, 200);
  assert.ok(requesterResponse.body.items.every((message) => message.visibility !== "INTERNAL"));
  const staffResponse = await request(app).get(`/conversations/${roomId}/messages`).set(authHeaders(internalEvent.authorId));
  assert.equal(staffResponse.status, 200);
  assert.equal(staffResponse.body.items.filter((message) => message.visibility === "INTERNAL").length, 2);

  // Verify reconnect and a fresh Node process read persisted BSON/Prisma objects unchanged.
  const expectedPublic = await prisma.message.findUnique({ where: { id: publicResult.body.id } });
  const expectedRich = await prisma.message.findUnique({ where: { id: richId } });
  await prisma.$disconnect();
  await prisma.$connect();
  const reconnectedPublic = await prisma.message.findUnique({ where: { id: publicResult.body.id } });
  assert.equal(reconnectedPublic.body, expectedPublic.body);
  assert.equal(+reconnectedPublic.createdAt, +expectedPublic.createdAt);
  const { spawnSync } = require("node:child_process");
  const child = spawnSync(process.execPath, ["-e", `const p=require('./backend/services/chat-service/src/models/prismaClient');(async()=>{const m=await p.message.findUnique({where:{id:${JSON.stringify(richId)}}});console.log(JSON.stringify(m));await p.$disconnect()})().catch(e=>{console.error(e);process.exit(1)})`], {
    cwd: process.cwd(), encoding: "utf8", timeout: 15000,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  assert.equal(child.status, 0, child.stderr);
  const afterProcessRestart = JSON.parse(child.stdout.trim());
  assert.equal(afterProcessRestart.body, expectedRich.body);
  assert.deepEqual(afterProcessRestart.payload, expectedRich.payload);
  assert.equal(afterProcessRestart.senderRole, expectedRich.senderRole);
  assert.equal(+new Date(afterProcessRestart.createdAt), +expectedRich.createdAt);
  assert.equal(broadcasts, 0);
  assert.equal(syncCalls, 0);

  const normalReply = await prisma.message.create({ data: { id: hex(), conversationId: roomId,
    senderId: internalEvent.authorId, senderRole: "AGENT", type: "TEXT", body: "New human reply",
    visibility: "ALL", syncStatus: "PENDING", syncAttempts: 0, nextRetryAt: new Date(0) } });
  failNextSync = true;
  const failedDelivery = await supportSyncWorker.processPendingMessages();
  assert.equal(failedDelivery.processed, 1);
  const pendingAfterFailure = await prisma.message.findUnique({ where: { id: normalReply.id } });
  assert.equal(pendingAfterFailure.syncStatus, "PENDING");
  assert.equal(pendingAfterFailure.syncAttempts, 1);
  assert.ok(pendingAfterFailure.nextRetryAt);
  await prisma.message.update({ where: { id: normalReply.id }, data: { nextRetryAt: new Date(0) } });
  const retriedDelivery = await supportSyncWorker.processPendingMessages();
  assert.equal(retriedDelivery.processed, 1);
  const syncedReply = await prisma.message.findUnique({ where: { id: normalReply.id } });
  assert.equal(syncedReply.syncStatus, "SYNCED");
  assert.equal(syncedReply.syncAttempts, 1);
  assert.equal(syncEvents.filter((event) => event.chatMessageId === normalReply.id).length, 2);
  assert.equal(broadcasts, 0);
});
}
