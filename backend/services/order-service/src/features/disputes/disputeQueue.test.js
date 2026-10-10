const { test } = require("node:test");
const assert = require("node:assert/strict");
const model = require("./disputeModel");
const service = require("./disputeService");
test("CS queue cannot remove access restrictions using scope or team filters", async (t) => {
  let input;
  t.mock.method(model, "listQueue", async (options) => {
    input = options;
    return { items: [], total: 0 };
  });
  await service.listQueue({
    role: "CUSTOMER_SERVICE",
    userId: "cs",
    scope: "all",
    assignedRole: "ADMIN",
  });
  assert.equal(input.restricted, true);
  assert.equal(input.userId, "cs");
  await assert.rejects(
    service.listQueue({
      role: "CUSTOMER_SERVICE",
      userId: "cs",
      scope: "invalid",
    }),
    { status: 400 },
  );
});
test("queue and count use the same access/filter predicate before pagination", async () => {
  let query, count;
  const db = {
    disputeCase: {
      findMany: async (options) => {
        query = options;
        return [];
      },
      count: async (options) => {
        count = options;
        return 0;
      },
    },
  };
  await model.listQueue(
    {
      scope: "unassigned",
      userId: "cs",
      restricted: true,
      search: "order",
      skip: 20,
      take: 20,
      sort: "newest",
    },
    db,
  );
  assert.deepEqual(query.where, count.where);
  assert.equal(query.skip, 20);
  assert.equal(query.take, 20);
  assert.ok(
    query.where.AND.some((item) =>
      item.OR?.some((entry) => entry.assignedRole === null),
    ),
  );
  assert.ok(query.where.AND.some((item) => item.assignedTo === null));
});
test("SLA pagination reaches terminal history only after active cases", async () => {
  const requests = [];
  const db = {
    disputeCase: {
      count: async ({ where }) =>
        where.AND?.some((item) => item.status?.not === "DECIDED") ? 22 : 30,
      findMany: async (options) => {
        requests.push(options);
        return options.where.AND?.some((item) => item.status === "DECIDED")
          ? [{ id: "done" }]
          : [{ id: "active-21" }, { id: "active-22" }];
      },
    },
  };
  const result = await model.listQueue(
    { scope: "all", skip: 20, take: 20, sort: "sla" },
    db,
  );
  assert.equal(result.total, 30);
  assert.equal(requests[1].skip, 0);
  assert.equal(requests[1].take, 18);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["active-21", "active-22", "done"],
  );
});

test("dashboard SLA filter uses the same bounded deadline predicate for rows and totals", async () => {
  const now = new Date("2026-10-10T00:00:00Z");
  let query, count;
  const db = {
    disputeCase: {
      findMany: async (options) => {
        query = options;
        return [];
      },
      count: async (options) => {
        count = options;
        return 0;
      },
    },
  };
  await model.listQueue(
    {
      scope: "mine",
      userId: "cs",
      restricted: true,
      work: "soon",
      now,
      sort: "newest",
      skip: 0,
      take: 20,
    },
    db,
  );
  assert.deepEqual(query.where, count.where);
  assert.ok(
    query.where.AND.some(
      (row) => row.status?.in?.join(",") === "OPEN,NEEDS_INFO",
    ),
  );
  assert.ok(
    query.where.AND.some(
      (row) =>
        +row.slaExpiresAt?.gt === +now &&
        +row.slaExpiresAt?.lte === +now + 3600000,
    ),
  );
  await assert.rejects(
    service.listQueue({
      role: "CUSTOMER_SERVICE",
      userId: "cs",
      work: "invalid",
    }),
    { status: 400 },
  );
});
