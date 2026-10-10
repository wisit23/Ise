const test = require("node:test");
const assert = require("node:assert/strict");
const {
  Prisma,
} = require("../../services/support-service/src/generated/prisma-client");
const { awaitingReplyIds } = require("./awaitingReply");
test("reply summary batches owned cases and never accepts unrelated IDs", async (t) => {
  const rows = Array.from({ length: 205 }, (_, i) => ({ id: "case-" + i }));
  const calls = [];
  let query;
  t.mock.method(global, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return {
      ok: true,
      json: async () => ({ ids: [body.ids[0], "unrelated"] }),
    };
  });
  const result = await awaitingReplyIds(
    {
      $queryRaw: async (q) => {
        query = q;
        return rows;
      },
    },
    Prisma,
    Prisma.sql`SELECT id, assignee_id FROM cases`,
    "agent",
    "disputes",
  );
  assert.deepEqual(result, ["case-0", "case-200"]);
  assert.deepEqual(
    calls.map((call) => call.ids.length),
    [200, 5],
  );
  assert.ok(query.values.includes("agent"));
  assert.deepEqual(calls[0].contextTypes, ["DISPUTE_BUYER", "DISPUTE_SELLER"]);
});
test("chat failure is an error rather than zero pending replies", async (t) => {
  t.mock.method(global, "fetch", async () => ({ ok: false }));
  await assert.rejects(
    awaitingReplyIds(
      { $queryRaw: async () => [{ id: "case" }] },
      Prisma,
      Prisma.sql`SELECT id, assignee_id FROM cases`,
      "agent",
      "tickets",
    ),
    { status: 503 },
  );
});
