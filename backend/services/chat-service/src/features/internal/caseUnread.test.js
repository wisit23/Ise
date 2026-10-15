const test = require("node:test");
const assert = require("node:assert/strict");
const { caseUnread } = require("./caseUnread");

test("case badges count public customer messages since the individual reader's cutoff", async () => {
  let pipeline, body;
  await caseUnread(
    {
      body: {
        ids: ["d1"],
        contextTypes: ["DISPUTE_BUYER", "DISPUTE_SELLER"],
        userId: "cs",
      },
    },
    {
      json: (value) => {
        body = value;
      },
    },
    (err) => {
      throw err;
    },
    {
      conversation: {
        aggregateRaw: async (args) => {
          pipeline = args.pipeline;
          return [{ id: "d1", count: 5 }];
        },
      },
    },
  );
  assert.equal(body.items[0].count, 5);
  const lookup = pipeline[2].$lookup;
  assert.deepEqual(lookup.let.since.$ifNull, [
    "$reader.lastReadAt",
    "$createdAt",
  ]);
  const match = lookup.pipeline[0].$match;
  assert.deepEqual(match.senderRole.$in, ["BUYER", "SELLER", "REQUESTER"]);
  assert.equal(match.senderId.$ne, "cs");
  assert.equal(match.deletedAt, null);
  assert.equal(match.visibility, "ALL");
  assert.equal(match.type.$ne, "SYSTEM");
});

test("invalid contexts or missing identity are rejected before querying", async () => {
  for (const body of [
    { ids: ["d1"], contextTypes: ["ORDER"], userId: "cs" },
    { ids: ["d1"], contextTypes: ["SUPPORT"] },
  ]) {
    let error;
    await caseUnread({ body }, { json: () => assert.fail() }, (err) => {
      error = err;
    });
    assert.equal(error.status, 400);
  }
});
