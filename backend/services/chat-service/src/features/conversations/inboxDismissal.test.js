const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const model = require("./conversationModel");
const service = require("./conversationService");
const controller = require("./conversationController");
const broadcast = require("../../realtime/broadcast");

test("explicit open restores only the caller's room and refreshes their inbox live", async (t) => {
  t.mock.method(service, "createOrOpenProductConversation", async () => ({ id: "room" }));
  const restore = t.mock.method(model, "restoreForParticipant", async () => ({ count: 1 }));
  const activity = t.mock.method(broadcast, "broadcastActivity", () => {});
  const res = { status: (value) => { assert.equal(value, 201); return res; }, json: () => {} };
  await controller.create({ body: { contextType: "PRODUCT", productId: "product", orderId: "order" }, userId: "seller" }, res, (err) => { throw err; });
  assert.deepEqual(restore.mock.calls[0].arguments, ["room", "seller"]);
  assert.deepEqual(activity.mock.calls[0].arguments, ["seller", { conversationId: "room" }]);
});

test("restoring a room keeps the other participant's dismissal", async (t) => {
  const original = prisma.inboxDismissal.deleteMany;
  t.after(() => { prisma.inboxDismissal.deleteMany = original; });
  let where;
  prisma.inboxDismissal.deleteMany = async (args) => { where = args.where; return { count: 1 }; };
  await model.restoreForParticipant("room", "seller");
  assert.deepEqual(where, { conversationId: "room", userId: "seller" });
});

test("hidden rooms are filtered only from their owner's inbox", async (t) => {
  const findHidden = prisma.inboxDismissal.findMany;
  const findRooms = prisma.conversation.findMany;
  t.after(() => { prisma.inboxDismissal.findMany = findHidden; prisma.conversation.findMany = findRooms; });
  prisma.inboxDismissal.findMany = async ({ where }) => where.userId === "me" ? [{ conversationId: "room" }] : [];
  prisma.conversation.findMany = async ({ where }) => where;
  assert.deepEqual((await model.listForParticipant("me")).id, { notIn: ["room"] });
  assert.equal((await model.listForParticipant("other")).id, undefined);
});

test("hide persists only the authenticated participant and broadcasts only to that user", async (t) => {
  t.mock.method(service, "getForParticipant", async (id, userId) => {
    assert.equal(userId, "me");
    return { id, contextType: "PRODUCT" };
  });
  const hide = t.mock.method(model, "hideForParticipant", async () => ({}));
  const emit = t.mock.method(broadcast, "broadcastRealtime", () => {});
  let result;
  await controller.hide({ params: { id: "room" }, userId: "me" }, { json: (value) => { result = value; } }, (err) => { throw err; });
  assert.deepEqual(hide.mock.calls[0].arguments, ["room", "me"]);
  assert.deepEqual(emit.mock.calls[0].arguments[0], {
    event: "conversation:hidden", data: { conversationId: "room" }, rooms: ["user:me"],
  });
  assert.deepEqual(result, { conversationId: "room" });
});

test("non-members cannot hide a room", async (t) => {
  const denied = Object.assign(new Error("Forbidden"), { status: 403 });
  t.mock.method(service, "getForParticipant", async () => { throw denied; });
  const hide = t.mock.method(model, "hideForParticipant", async () => ({}));
  let error;
  await controller.hide({ params: { id: "room" }, userId: "stranger" }, {}, (err) => { error = err; });
  assert.equal(error, denied);
  assert.equal(hide.mock.callCount(), 0);
});
