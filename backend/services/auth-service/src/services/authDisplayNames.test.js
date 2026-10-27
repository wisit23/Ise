const test = require("node:test");
const assert = require("node:assert/strict");
const prismaPath = require.resolve("../models/prismaClient");
const prisma = { user: { findMany: async () => [] } };
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prisma,
};
const { getDisplayNames } = require("./authService");

test("the directory supplies a user's own name separately from their shop name", async (t) => {
  t.mock.method(prisma.user, "findMany", async () => [
    {
      id: "user-1",
      firstName: "สมชาย",
      lastName: "นามสกุลส่วนตัว",
      sellerProfile: { shopName: "GG SHOP" },
      role: "SELLER",
      roles: [],
    },
  ]);
  const [user] = await getDisplayNames(["user-1"]);
  assert.equal(user.userName, "สมชาย");
  assert.equal(user.displayName, "GG SHOP");
  assert.ok(!JSON.stringify(user).includes("นามสกุลส่วนตัว"));
});
