const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const { eligibleStaff } = require("./internalController");

test("staff exclusion applies before both directory pagination and total count", async (t) => {
  let query, counted;
  const findMany = prisma.user.findMany,
    count = prisma.user.count;
  t.after(() => {
    prisma.user.findMany = findMany;
    prisma.user.count = count;
  });
  prisma.user.findMany = async (args) => {
    query = args;
    return [];
  };
  prisma.user.count = async (args) => {
    counted = args;
    return 0;
  };
  let response;
  await eligibleStaff(
    {
      body: {
        roles: ["CUSTOMER_SERVICE"],
        excludeIds: ["myself"],
        page: 2,
        limit: 10,
      },
    },
    {
      json: (value) => {
        response = value;
      },
    },
    (err) => {
      throw err;
    },
  );
  assert.ok(
    query.where.AND.some((clause) => clause.id?.notIn.includes("myself")),
  );
  assert.deepEqual(counted.where, query.where);
  assert.equal(query.skip, 10);
  assert.equal(response.total, 0);
});
