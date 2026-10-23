const test = require("node:test");
const assert = require("node:assert/strict");
const conversationModel = require("../conversations/conversationModel");
const messageModel = require("./messageModel");
const { unreadCount } = require("./messageService");

test("global unread excludes inaccessible soft-deleted disputes and departed participants", async (t) => {
  const member = { userId: "buyer", role: "BUYER", lastReadAt: new Date(0) };
  t.mock.method(conversationModel, "listForParticipant", async () => [
    {
      id: "hidden",
      contextType: "DISPUTE_BUYER",
      contextId: "deleted-dispute",
      participants: [member],
    },
    { id: "normal", contextType: "PRODUCT", participants: [member] },
    {
      id: "left",
      contextType: "PRODUCT",
      participants: [{ ...member, leftAt: new Date() }],
    },
  ]);
  t.mock.method(global, "fetch", async () => ({
    ok: true,
    json: async () => ({ allowed: false, writable: false }),
  }));
  const count = t.mock.method(messageModel, "countUnread", async () => 2);
  assert.equal(await unreadCount("buyer"), 2);
  assert.equal(count.mock.callCount(), 1);
  assert.equal(count.mock.calls[0].arguments[0].conversationId, "normal");
});
