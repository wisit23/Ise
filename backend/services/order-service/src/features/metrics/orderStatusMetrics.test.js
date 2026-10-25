const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const { getOrderStatusBreakdown, COUNTED_STATUSES } = require("./orderStatusMetrics");

test("executive in-progress metrics count preparation, pickup and transit without legacy shipped", async (t) => {
  let parameters;
  // The composed Prisma client forwards raw methods through a Proxy; install
  // an own method for this test rather than mocking a non-own descriptor.
  const descriptor = Object.getOwnPropertyDescriptor(prisma, "$queryRaw");
  t.after(() => {
    if (descriptor) Object.defineProperty(prisma, "$queryRaw", descriptor);
    else delete prisma.$queryRaw;
  });
  prisma.$queryRaw = async (...args) => {
    parameters = args;
    return [
      { status: "confirmed", n: 1 }, { status: "ready_to_ship", n: 2 },
      { status: "pickup_in_progress", n: 3 }, { status: "in_transit", n: 4 },
      { status: "completed", n: 5 }, { status: "disputed", n: 6 }, { status: "refunded", n: 7 },
    ];
  };
  const from = new Date("2026-10-01"), to = new Date("2026-11-01");
  assert.deepEqual(await getOrderStatusBreakdown({ from, to }), {
    completed: 5, inProgress: 10, disputeRefund: 13, total: 28,
  });
  assert.equal(parameters[1], from);
  assert.equal(parameters[2], to);
  assert.deepEqual(parameters[3], COUNTED_STATUSES);
  for (const status of ["ready_to_ship", "pickup_in_progress", "in_transit"])
    assert.ok(COUNTED_STATUSES.includes(status));
  assert.ok(!COUNTED_STATUSES.includes("shipped"));
});
