const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./ticketModel");
const service = require("./ticketService");
const chatClient = require("../../services/chatClient");
const { ticketCapabilities } = require("./workspacePolicy");

const escalated = {
  id: "t",
  status: "ESCALATED",
  assigneeId: "ts-1",
  chatResponderId: "cs-1",
  version: 3,
  conversationId: "c-1",
};

test("only the T&S owner of an escalated ticket gets the send-back capability", () => {
  assert.equal(ticketCapabilities(escalated, "ts-1", "TRUST_AND_SAFETY").canRequestEvidence, true);
  assert.equal(ticketCapabilities(escalated, "ts-1", "ADMIN").canRequestEvidence, true);
  assert.equal(ticketCapabilities(escalated, "other-ts", "TRUST_AND_SAFETY").canRequestEvidence, false);
  assert.equal(ticketCapabilities({ ...escalated, assigneeId: "cs-1" }, "cs-1", "CUSTOMER_SERVICE").canRequestEvidence, false);
  assert.equal(ticketCapabilities({ ...escalated, status: "IN_PROGRESS" }, "ts-1", "TRUST_AND_SAFETY").canRequestEvidence, false);
});

test("a returned ticket shows the CS owner the checklist until it is escalated again", () => {
  const returned = { ...escalated, status: "IN_PROGRESS", assigneeId: "cs-1", returnedAt: new Date() };
  const caps = ticketCapabilities(returned, "cs-1", "CUSTOMER_SERVICE");
  assert.equal(caps.isReturned, true);
  assert.equal(caps.canEscalate, true);
  assert.equal(ticketCapabilities({ ...returned, returnedAt: null }, "cs-1", "CUSTOMER_SERVICE").isReturned, false);
  assert.equal(ticketCapabilities({ ...returned, status: "ESCALATED" }, "ts-1", "TRUST_AND_SAFETY").isReturned, false);
});

test("sending back returns the ticket to the CS agent who escalated it", async (t) => {
  let args;
  t.mock.method(model, "findById", async () => escalated);
  t.mock.method(model, "returnToCs", async (input) => { args = input; return true; });
  t.mock.method(chatClient, "sendSystemMessage", async () => {});
  await service.requestMoreEvidence({
    ticketId: "t", userId: "ts-1", role: "TRUST_AND_SAFETY", version: 3,
    reason: "  ต้องการหลักฐานเพิ่ม ", tasks: [" ขอรูปพัสดุ ", "", "โทรยืนยัน"],
  });
  assert.equal(args.csAgentId, "cs-1");
  assert.equal(args.reason, "ต้องการหลักฐานเพิ่ม");
  assert.deepEqual(args.tasks.map((task) => task.text), ["ขอรูปพัสดุ", "โทรยืนยัน"]);
  assert.ok(args.tasks.every((task) => task.done === false && task.id));
});

test("send-back refuses non-owners, other statuses, missing reason and stale versions", async (t) => {
  let ticket = escalated;
  let writes = 0;
  t.mock.method(model, "findById", async () => ticket);
  t.mock.method(model, "returnToCs", async () => { writes++; return true; });
  t.mock.method(chatClient, "sendSystemMessage", async () => {});
  const call = (overrides = {}) =>
    service.requestMoreEvidence({
      ticketId: "t", userId: "ts-1", role: "TRUST_AND_SAFETY", version: 3, reason: "x", tasks: [], ...overrides,
    });
  await assert.rejects(call({ role: "CUSTOMER_SERVICE" }), { status: 403 });
  await assert.rejects(call({ userId: "other-ts" }), { status: 403 });
  await assert.rejects(call({ reason: " " }), { status: 400 });
  await assert.rejects(call({ version: 2 }), { status: 409 });
  await assert.rejects(call({ tasks: "nope" }), { status: 400 });
  ticket = { ...escalated, status: "IN_PROGRESS" };
  await assert.rejects(call(), { status: 400 });
  assert.equal(writes, 0);
});

test("only the assigned CS owner of a returned ticket can tick tasks", async (t) => {
  const returned = { ...escalated, status: "IN_PROGRESS", assigneeId: "cs-1", returnedAt: new Date() };
  let updated;
  t.mock.method(model, "findById", async () => returned);
  t.mock.method(model, "updateReturnTask", async (input) => { updated = input; return { returnTasks: [], returnedAt: returned.returnedAt }; });
  await service.updateReturnTask({ ticketId: "t", taskId: "a", userId: "cs-1", role: "CUSTOMER_SERVICE", done: true, note: " ได้แล้ว " });
  assert.deepEqual([updated.done, updated.note], [true, "ได้แล้ว"]);
  await assert.rejects(service.updateReturnTask({ ticketId: "t", taskId: "a", userId: "cs-2", role: "CUSTOMER_SERVICE", done: true }), { status: 403 });
  await assert.rejects(service.updateReturnTask({ ticketId: "t", taskId: "a", userId: "ts-1", role: "TRUST_AND_SAFETY", done: true }), { status: 403 });
});
