const test = require("node:test");
const assert = require("node:assert/strict");
const broadcast = require("./broadcast");

test("case messages and status reach current participants only", async (t) => {
  const originalFetch = global.fetch;
  const events = [];
  t.after(() => {
    global.fetch = originalFetch;
    broadcast.setIo(null);
  });
  global.fetch = async (url) => ({
    ok: true,
    json: async () => ({
      allowed: !url.includes("old-agent"),
      writable: !url.includes("old-agent"),
    }),
  });
  broadcast.setIo({
    to: (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }),
  });
  const conversation = {
    id: "room-1",
    contextType: "DISPUTE",
    contextId: "case-1",
    participants: [
      { userId: "buyer-1", role: "BUYER" },
      { userId: "old-agent", role: "AGENT" },
    ],
  };
  broadcast.broadcastMessage(conversation, { id: "message-1", visibility: "PUBLIC" });
  await broadcast.broadcastCaseTyping(conversation, "agent-now", true);
  broadcast.broadcastStatusChange(conversation, "LOCKED");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(new Set(events.map((entry) => entry.room)), new Set(["user:buyer-1"]));
  assert.equal(events.filter((entry) => entry.event === "message:new").length, 1);
  assert.equal(events.filter((entry) => entry.event === "conversation:status").length, 1);
  assert.deepEqual(events.find(entry => entry.event === "typing"), {
    room: "user:buyer-1", event: "typing",
    payload: { conversationId: "room-1", userId: "agent-now", typing: true },
  });
  const before = events.length;
  await broadcast.broadcastCaseTyping(conversation, "buyer-1", false);
  assert.equal(events.length, before); // sender excluded, stale agent denied
});
