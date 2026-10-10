const test = require("node:test");
const assert = require("node:assert/strict");

let users;
let createCalled;

const orderModel = {
  findByAuctionId: async () => null,
  create: async () => {
    createCalled = true;
    return { id: "order-1" };
  },
};
const authClient = {
  getUser: async (id) => users[id] || null,
};

const orderModelPath = require.resolve("./models/orderModel");
const authClientPath = require.resolve("./services/authClient");
require.cache[orderModelPath] = {
  id: orderModelPath,
  filename: orderModelPath,
  loaded: true,
  exports: orderModel,
};
require.cache[authClientPath] = {
  id: authClientPath,
  filename: authClientPath,
  loaded: true,
  exports: authClient,
};

const controller = require("./controllers/orderController");

function request() {
  return {
    body: {
      auctionId: "auction-1",
      productId: "product-1",
      productTitle: "Product",
      sellerId: "seller-1",
      buyerId: "buyer-1",
      price: 100,
    },
  };
}

test.beforeEach(() => {
  users = {
    "buyer-1": { id: "buyer-1", status: "ACTIVE" },
    "seller-1": { id: "seller-1", status: "ACTIVE" },
  };
  createCalled = false;
});

test("automatic auction order is blocked for a restricted buyer", async () => {
  users["buyer-1"].status = "RESTRICTED_BUYER";
  let failure;

  await controller.createFromAuction(request(), {}, (error) => {
    failure = error;
  });

  assert.equal(failure.status, 403);
  assert.match(failure.message, /purchase rights/);
  assert.equal(createCalled, false);
});

test("automatic auction order is blocked for a restricted seller", async () => {
  users["seller-1"].status = "RESTRICTED_SELLER";
  let failure;

  await controller.createFromAuction(request(), {}, (error) => {
    failure = error;
  });

  assert.equal(failure.status, 403);
  assert.match(failure.message, /selling rights/);
  assert.equal(createCalled, false);
});

test("automatic auction order is blocked for a fully suspended participant", async () => {
  users["buyer-1"].status = "SUSPENDED";
  let failure;

  await controller.createFromAuction(request(), {}, (error) => {
    failure = error;
  });

  assert.equal(failure.status, 403);
  assert.match(failure.message, /must be active/);
  assert.equal(createCalled, false);
});
