const test = require("node:test");
const assert = require("node:assert/strict");
const ticketService = require("./ticketService");
const ticketModel = require("./ticketModel");
const chatClient = require("../../services/chatClient");
const { notifyTicketStatus, noticeKey } = require("./ticketNotifications");

const TICKET = {
  id: "t-1",
  ticketNumber: "SUP-0001",
  subject: "สินค้าไม่ถึง",
  requesterId: "buyer-1",
  assigneeId: "cs-1",
  version: 3,
};

function captureNotifications(t) {
  const sent = [];
  t.mock.method(chatClient, "sendNotification", async (data) => {
    sent.push(data);
    return { id: `n-${sent.length}` };
  });
  return sent;
}

test("every customer-facing status maps to a notice; internal-only ones don't", () => {
  for (const status of ["ASSIGNED", "IN_PROGRESS", "PENDING_USER", "ESCALATED", "RESOLVED", "CLOSED"])
    assert.ok(noticeKey(status, "NEW"), status);
  assert.equal(noticeKey("IN_PROGRESS", "RESOLVED"), "REOPENED");
  assert.equal(noticeKey("NEW", null), null);
});

test("status notice goes to the requester with a link to their ticket", async (t) => {
  const sent = captureNotifications(t);
  await notifyTicketStatus({ ...TICKET, status: "RESOLVED" }, "RESOLVED", "IN_PROGRESS");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].userId, "buyer-1");
  assert.equal(sent[0].type, "SUPPORT");
  assert.equal(sent[0].link, "/support/tickets/t-1");
  assert.match(sent[0].message, /SUP-0001/);
  assert.deepEqual(sent[0].metadata, { ticketId: "t-1", status: "RESOLVED", previousStatus: "IN_PROGRESS" });
});

test("escalation is worded as further review without naming the internal team", async (t) => {
  const sent = captureNotifications(t);
  await notifyTicketStatus(TICKET, "ESCALATED", "IN_PROGRESS");
  assert.match(sent[0].title, /ตรวจสอบเพิ่มเติม/);
  assert.doesNotMatch(`${sent[0].title} ${sent[0].message}`, /Trust|T&S|Admin/i);
});

test("a chat-service failure is swallowed so the status change still succeeds", async (t) => {
  t.mock.method(chatClient, "sendNotification", async () => {
    throw new Error("chat down");
  });
  t.mock.method(console, "error", () => {});
  assert.equal(await notifyTicketStatus(TICKET, "CLOSED", "RESOLVED"), null);
});

test("no requester means no notice", async (t) => {
  const sent = captureNotifications(t);
  await notifyTicketStatus({ ...TICKET, requesterId: null }, "CLOSED", "RESOLVED");
  assert.equal(sent.length, 0);
});

test("changeStatus notifies the requester once per change, including CLOSED", async (t) => {
  const sent = captureNotifications(t);
  let status = "IN_PROGRESS";
  t.mock.method(ticketModel, "findById", async () => ({ ...TICKET, status, conversationId: "room" }));
  t.mock.method(ticketModel, "transitionStatus", async (input) => {
    status = input.status;
    return true;
  });
  t.mock.method(chatClient, "sendSystemMessage", async () => ({}));
  t.mock.method(chatClient, "lockConversation", async () => true);

  await ticketService.changeStatus({ ticketId: "t-1", userId: "cs-1", role: "CUSTOMER_SERVICE", status: "PENDING_USER" });
  await ticketService.changeStatus({ ticketId: "t-1", userId: "cs-1", role: "CUSTOMER_SERVICE", status: "RESOLVED" });
  await ticketService.changeStatus({ ticketId: "t-1", userId: "cs-1", role: "CUSTOMER_SERVICE", status: "CLOSED" });

  assert.deepEqual(sent.map((n) => n.metadata.status), ["PENDING_USER", "RESOLVED", "CLOSED"]);
  assert.ok(sent.every((n) => n.userId === "buyer-1"));
});

test("claiming a new ticket tells the requester it was picked up", async (t) => {
  const sent = captureNotifications(t);
  let assigned = false;
  t.mock.method(ticketModel, "findById", async () => ({
    ...TICKET,
    assigneeId: assigned ? "cs-1" : null,
    status: assigned ? "ASSIGNED" : "NEW",
    conversationId: null,
  }));
  t.mock.method(ticketModel, "assign", async () => {
    assigned = true;
    return true;
  });
  await ticketService.assignToSelf({ ticketId: "t-1", userId: "cs-1", role: "CUSTOMER_SERVICE" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].metadata.status, "ASSIGNED");
});
