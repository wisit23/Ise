const test = require("node:test");
const assert = require("node:assert/strict");

const { awaitingReply } = require("./awaitingReply");
test("reply summary excludes internal/system/deleted messages and deduplicates parties", async () => {
  let pipeline;
  const db = {
    conversation: {
      aggregateRaw: async (options) => {
        pipeline = options.pipeline;
        return [{ contextId: "d1" }, { contextId: "d1" }, { contextId: "d2" }];
      },
    },
  };
  let result;
  await awaitingReply(
    {
      body: {
        ids: ["d1", "d2"],
        contextTypes: ["DISPUTE_BUYER", "DISPUTE_SELLER"],
      },
    },
    { json: (value) => (result = value) },
    (error) => {
      throw error;
    },
    db,
  );
  assert.deepEqual(result, { ids: ["d1", "d2"] });
  const match = pipeline[1].$lookup.pipeline[0].$match;
  assert.equal(match.visibility, "ALL");
  assert.equal(match.deletedAt, null);
  assert.equal(match.type.$ne, "SYSTEM");
  assert.ok(!match.senderRole.$in.includes("SYSTEM"));
  assert.deepEqual(pipeline[2].$match["lastPublic.0.senderRole"].$in, [
    "BUYER",
    "SELLER",
    "REQUESTER",
  ]);
});
test("invalid summary inputs fail before querying", async () => {
  let error;
  await awaitingReply(
    { body: { ids: ["x"], contextTypes: ["PRODUCT"] } },
    { json: () => assert.fail() },
    (err) => (error = err),
  );
  assert.equal(error.status, 400);
});
