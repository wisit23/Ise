const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const { getExecutiveDispute } = require("./executiveDisputeDetail");

const dispute = {
  id: "dispute-1",
  createdBy: "buyer-1",
  order: {
    id: "order-1",
    sellerId: "seller-1",
    ordersAmount: 500,
  },
};

test("a shop owner opening a dispute is shown as a user, while the seller keeps their shop name", async (t) => {
  t.mock.method(prisma.disputeCase, "findUnique", async () => dispute);
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => [
      { userId: "buyer-1", displayName: "GG SHOP", userName: "สมชาย" },
      { userId: "seller-1", displayName: "ร้านผู้ขาย", userName: "มาลี" },
    ],
  }));

  const result = await getExecutiveDispute(dispute.id);
  assert.equal(result.data.buyer.name, "สมชาย");
  assert.equal(result.data.seller.name, "ร้านผู้ขาย");
  assert.equal(result.meta.namesAvailable, true);
});

test("missing or invalid user names never fall back to a shop name", async (t) => {
  t.mock.method(prisma.disputeCase, "findUnique", async () => dispute);
  for (const userName of [undefined, null, " ", 123]) {
    const mock = t.mock.method(globalThis, "fetch", async () => ({
      ok: true,
      json: async () => [
        { userId: "buyer-1", displayName: "GG SHOP", userName },
      ],
    }));
    const result = await getExecutiveDispute(dispute.id);
    assert.equal(result.data.buyer.name, null);
    mock.mock.restore();
  }
});

test("a directory failure keeps the dispute accessible without substituting a shop name", async (t) => {
  t.mock.method(prisma.disputeCase, "findUnique", async () => dispute);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("unavailable");
  });
  const result = await getExecutiveDispute(dispute.id);
  assert.equal(result.data.buyer.name, null);
  assert.equal(result.meta.namesAvailable, false);
});
