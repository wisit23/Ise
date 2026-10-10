const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createShopChangeRequestService,
  serializeRequest,
} = require("./shopChangeRequestService");

test("serializes normalized request items into the existing API shape", () => {
  const request = {
    id: "request-1",
    items: [
      { fieldName: "shop_name", oldValue: "Old", newValue: "New" },
      { fieldName: "address", oldValue: "A", newValue: "B" },
    ],
  };

  assert.deepEqual(serializeRequest(request), {
    ...request,
    shopName: "New",
    address: "B",
    bankAccount: null,
  });
});

test("submit stores one item per changed field with old and new values", async () => {
  let createdData;
  const tx = {
    sellerProfile: {
      findUnique: async () => ({
        shopName: "Old Shop",
        address: "Old Address",
        bankAccount: "111",
      }),
    },
    shopChangeRequest: {
      findFirst: async () => null,
      create: async ({ data }) => {
        createdData = data;
        return { id: "request-1", ...data, items: data.items.create };
      },
    },
  };
  const service = createShopChangeRequestService({
    $transaction: (callback) => callback(tx),
  });

  const result = await service.submit("seller-1", {
    shopName: "New Shop",
    address: "Old Address",
    comment: "  rebrand  ",
  });

  assert.equal(createdData.comment, "rebrand");
  assert.deepEqual(createdData.items.create, [
    {
      fieldName: "shop_name",
      oldValue: "Old Shop",
      newValue: "New Shop",
    },
  ]);
  assert.equal(result.shopName, "New Shop");
  assert.equal(result.address, null);
});

test("approve applies item values and atomically claims the pending request", async () => {
  let profilePatch;
  let decisionData;
  const request = {
    id: "request-1",
    sellerId: "seller-1",
    status: "PENDING",
    items: [
      {
        fieldName: "bank_account",
        oldValue: "111",
        newValue: "222",
      },
    ],
  };
  const tx = {
    shopChangeRequest: {
      findUnique: async () =>
        decisionData ? { ...request, status: decisionData.status } : request,
      updateMany: async ({ data }) => {
        decisionData = data;
        return { count: 1 };
      },
    },
    sellerProfile: {
      findUnique: async () => ({
        shopName: "Shop",
        address: "Address",
        bankAccount: "111",
      }),
      update: async ({ data }) => {
        profilePatch = data;
      },
    },
  };
  const service = createShopChangeRequestService({
    $transaction: (callback) => callback(tx),
  });

  const result = await service.decide("admin-1", "request-1", {
    decision: "APPROVED",
    adminNote: " verified ",
  });

  assert.deepEqual(profilePatch, { bankAccount: "222" });
  assert.equal(decisionData.status, "APPROVED");
  assert.equal(decisionData.adminNote, "verified");
  assert.equal(result.bankAccount, "222");
});
