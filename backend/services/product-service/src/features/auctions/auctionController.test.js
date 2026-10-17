const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("./auctionService");
const controller = require("./auctionController");

test("public auction detail uses the lifecycle-aware service and propagates errors", async (t) => {
  const auction = {
    id: "demo-auction",
    status: "closed",
    winningOrderId: "order-1",
  };
  const get = t.mock.method(service, "get", async (id) => {
    assert.equal(id, auction.id);
    return auction;
  });
  let body;
  await controller.getOne(
    { params: { id: auction.id } },
    {
      json: (data) => {
        body = data;
      },
    },
    (err) => {
      throw err;
    },
  );
  assert.deepEqual(body, auction);
  assert.equal(get.mock.callCount(), 1);
  const missing = new Error("auction not found");
  get.mock.mockImplementation(async () => {
    throw missing;
  });
  let error;
  await controller.getOne(
    { params: { id: "missing" } },
    { json: () => assert.fail("unexpected response") },
    (err) => {
      error = err;
    },
  );
  assert.equal(error, missing);
});

test("reject forwards the authenticated Marketing user and required reason", async (t) => {
  const rejected = { id: "auction-pending", status: "rejected" };
  const reject = t.mock.method(service, "reject", async (input) => {
    assert.deepEqual(input, {
      user: {
        id: "marketing-1",
        role: "MARKETING",
        kycVerified: undefined,
        kycStatus: undefined,
      },
      auctionId: "auction-pending",
      reason: "รูปภาพไม่ชัดเจน",
    });
    return rejected;
  });

  let body;
  await controller.reject(
    {
      userId: "marketing-1",
      userRole: "MARKETING",
      params: { id: "auction-pending" },
      body: { reason: "รูปภาพไม่ชัดเจน" },
    },
    { json: (data) => { body = data; } },
    (err) => { throw err; },
  );

  assert.deepEqual(body, rejected);
  assert.equal(reject.mock.callCount(), 1);
});

test("list forwards multi-value filters and search to the service", async (t) => {
  const list = t.mock.method(service, "list", async (filters) => {
    assert.deepEqual(filters, {
      status: undefined,
      roundId: undefined,
      statuses: ["pending_approval", "approved"],
      roundIds: ["round-1", "round-2"],
      search: "เสื้อวินเทจ",
      skip: 20,
      take: 20,
    });
    return { items: [], total: 0 };
  });
  let responseBody;

  await controller.list(
    {
      query: {
        page: "2",
        limit: "20",
        statuses: "pending_approval,approved",
        roundIds: ["round-1", "round-2"],
        search: "เสื้อวินเทจ",
      },
    },
    { json: (body) => { responseBody = body; } },
    (err) => { throw err; },
  );

  assert.equal(list.mock.callCount(), 1);
  assert.equal(responseBody.total, 0);
  assert.equal(responseBody.page, 2);
});
