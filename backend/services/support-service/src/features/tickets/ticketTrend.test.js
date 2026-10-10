const test = require("node:test");
const assert = require("node:assert/strict");
const { readTicketTrend, trend } = require("./ticketTrend");

test("trend aggregates the complete permitted queue, ordered by calendar date without a page limit", async () => {
  let query;
  const db = {
    $queryRaw: async (statement) => {
      query = statement;
      return [{ date: "2026-10-09", value: 250 }];
    },
  };
  const rows = await readTicketTrend(
    { role: "CUSTOMER_SERVICE", userId: "agent", days: 14 },
    db,
  );
  assert.equal(rows[0].value, 250);
  assert.match(query.sql, /generate_series/);
  assert.match(query.sql, /GROUP BY dates.day ORDER BY dates.day/);
  assert.match(query.sql, /assignee_id =/);
  assert.ok(query.values.includes("agent"));
  assert.doesNotMatch(query.sql, /LIMIT 50|OFFSET/);
});

test("trend rejects customer roles and invalid ranges before querying", async () => {
  const request = { userRole: "BUYER", userId: "buyer", query: {} };
  let error;
  await trend(request, {}, (value) => {
    error = value;
  });
  assert.equal(error.status, 403);
  await trend(
    { ...request, userRole: "ADMIN", query: { days: "1 OR 1=1" } },
    {},
    (value) => {
      error = value;
    },
  );
  assert.equal(error.status, 400);
});
