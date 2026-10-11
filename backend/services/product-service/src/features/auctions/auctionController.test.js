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
