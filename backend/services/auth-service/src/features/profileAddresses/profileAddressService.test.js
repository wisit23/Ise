const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfileAddressService } = require("./profileAddressService");

const ADDRESS = {
  recipientName: "สมชาย ใจดี",
  phone: "0812345678",
  addressLine: "99 ถนนสุขุมวิท",
  subdistrict: "คลองเตย",
  district: "คลองเตย",
  province: "กรุงเทพมหานคร",
  postalCode: "10110",
  isDefault: false,
};

function createMockPrisma(overrides = {}) {
  const userAddress = {
    findMany: async () => [],
    findFirst: async () => null,
    count: async () => 0,
    updateMany: async () => ({ count: 0 }),
    create: async ({ data }) => ({ id: "address-1", ...data }),
    update: async ({ where, data }) => ({ id: where.id, ...data }),
    delete: async () => ({}),
    ...overrides,
  };
  return {
    userAddress,
    $transaction: async (callback) => callback({ userAddress }),
  };
}

test("the first saved address becomes the default and belongs to the user", async () => {
  let createData;
  const prisma = createMockPrisma({
    create: async ({ data }) => {
      createData = data;
      return { id: "address-1", ...data };
    },
  });
  const service = createProfileAddressService(prisma);

  const result = await service.create("user-1", ADDRESS);

  assert.equal(createData.userId, "user-1");
  assert.equal(createData.isDefault, true);
  assert.equal(result.id, "address-1");
});

test("setting a default address clears the previous default", async () => {
  const calls = [];
  const prisma = createMockPrisma({
    findFirst: async () => ({ id: "address-2", userId: "user-1" }),
    updateMany: async (args) => {
      calls.push(args);
      return { count: 1 };
    },
  });
  const service = createProfileAddressService(prisma);

  const result = await service.setDefault("user-1", "address-2");

  assert.deepEqual(calls[0].where, { userId: "user-1", isDefault: true });
  assert.equal(result.isDefault, true);
});

test("an address owned by another user cannot be updated", async () => {
  const service = createProfileAddressService(createMockPrisma());

  await assert.rejects(
    service.update("user-1", "foreign-address", { province: "เชียงใหม่" }),
    (err) => err.status === 404 && err.message === "address not found",
  );
});

test("deleting the default address promotes the oldest remaining address", async () => {
  const updates = [];
  const prisma = createMockPrisma({
    findFirst: async (args) => {
      if (args.where.id) {
        return { id: "address-1", userId: "user-1", isDefault: true };
      }
      return { id: "address-2", userId: "user-1", isDefault: false };
    },
    update: async (args) => {
      updates.push(args);
      return { id: args.where.id, ...args.data };
    },
  });
  const service = createProfileAddressService(prisma);

  await service.remove("user-1", "address-1");

  assert.deepEqual(updates, [
    { where: { id: "address-2" }, data: { isDefault: true } },
  ]);
});
