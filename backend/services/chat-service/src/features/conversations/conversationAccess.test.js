const test = require("node:test");
const assert = require("node:assert/strict");
const conversationModel = require("./conversationModel");
const conversationService = require("./conversationService");

test("a former case participant cannot read or send after owner revokes access", async (t) => {
  const originalFind = conversationModel.findById;
  const originalFetch = global.fetch;
  t.after(() => {
    conversationModel.findById = originalFind;
    global.fetch = originalFetch;
  });
  conversationModel.findById = async () => ({
    id: "room-1", contextType: "DISPUTE", contextId: "case-1",
    participants: [{ userId: "old-agent", role: "AGENT", leftAt: null }],
  });
  global.fetch = async () => ({
    ok: true, json: async () => ({ allowed: false, writable: false }),
  });
  await assert.rejects(() => conversationService.getForParticipant("room-1", "old-agent"),
    (err) => err.status === 403);
  global.fetch = async () => ({
    ok: true, json: async () => ({ allowed: true, writable: false }),
  });
  await conversationService.getForParticipant("room-1", "old-agent");
  await assert.rejects(() => conversationService.getForParticipant("room-1", "old-agent", { write: true }),
    (err) => err.status === 403);
});
