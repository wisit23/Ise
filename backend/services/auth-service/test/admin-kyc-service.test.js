const test = require("node:test");
const assert = require("node:assert/strict");

const queries = [];
const prisma = {
  kycApplication: {
    findMany: async (query) => {
      queries.push(query);
      return [{ id: "kyc-1", user: { sellerProfile: {} } }];
    },
    count: async () => 1,
  },
};

const prismaPath = require.resolve("../src/models/prismaClient");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prisma,
};
const service = require("../src/features/adminKyc/adminKycService");

test("KYC queue defaults to PENDING for legacy clients", async () => {
  const result = await service.listQueue({ page: 1, limit: 10 });
  assert.deepEqual(queries.at(-1).where, { status: "PENDING" });
  assert.equal(result.items[0].profileSnapshotAvailable, false);
});

test("KYC queue explicitly supports ALL without a status predicate", async () => {
  await service.listQueue({ page: 2, limit: 10, status: "ALL" });
  assert.deepEqual(queries.at(-1).where, {});
  assert.equal(queries.at(-1).skip, 10);
  assert.equal(queries.at(-1).take, 10);
});
