const test = require("node:test");
const assert = require("node:assert/strict");
const { readCaseUnread } = require("./caseUnread");

test("unread counts are scoped to authorized cases, preserve zeroes, and sum messages rather than cases", async (t) => {
  t.mock.method(global, "fetch", async (url, options) => {
    assert.ok(url.endsWith("/internal/case-unread"));
    assert.deepEqual(JSON.parse(options.body).contextTypes, [
      "DISPUTE_BUYER",
      "DISPUTE_SELLER",
    ]);
    return {
      ok: true,
      json: async () => ({
        items: [
          { id: "d1", count: 4 },
          { id: "d2", count: 2 },
        ],
      }),
    };
  });
  const result = await readCaseUnread(
    [
      { id: "d1", assigneeId: "cs" },
      { id: "d2", assigneeId: null },
      { id: "d3", assigneeId: "other" },
    ],
    "cs",
    "disputes",
  );
  assert.deepEqual(result.scopes, { mine: 4, unassigned: 2, all: 6 });
  assert.deepEqual(result.items[2], { id: "d3", count: 0 });
});

test("unread outage is not represented as a zero count and unrequested IDs are rejected", async (t) => {
  t.mock.method(global, "fetch", async () => ({ ok: false }));
  await assert.rejects(readCaseUnread([{ id: "t1" }], "cs", "tickets"), {
    status: 503,
  });
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ items: [{ id: "private", count: 1 }] }),
  });
  await assert.rejects(readCaseUnread([{ id: "t1" }], "cs", "tickets"), {
    status: 503,
  });
});
