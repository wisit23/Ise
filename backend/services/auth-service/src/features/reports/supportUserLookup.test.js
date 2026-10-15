const test = require("node:test");
const assert = require("node:assert/strict");
const { findSupportUser } = require("./supportUserLookup");
const id = "7123412d-a123-4567-8901-123456789abc";

test("an exact ID copied with # resolves without prefix guessing", async () => {
  const db = { user: { findFirst: async ({ where }) => {
    assert.equal(where.OR[0].id, id);
    return { id };
  }, findMany: async () => { throw new Error("unexpected prefix lookup"); } } };
  assert.equal((await findSupportUser(db, `  #${id}  `)).id, id);
});

test("the truncated ID shown in older tickets resolves only a unique prefix", async () => {
  const db = { user: { findFirst: async () => null, findMany: async (query) => {
    assert.deepEqual(query.where, { id: { startsWith: "7123412d-a", mode: "insensitive" } });
    assert.equal(query.take, 2);
    return [{ id }];
  } } };
  assert.equal((await findSupportUser(db, "#7123412d-a")).id, id);
});

test("an ambiguous prefix cannot return an arbitrary user", async () => {
  const db = { user: { findFirst: async () => null, findMany: async () => [{ id }, { id: "other" }] } };
  await assert.rejects(findSupportUser(db, "#7123412d-a"), /กรุณาใช้รหัสผู้ใช้เต็ม/);
});

test("an unknown prefix returns not found", async () => {
  const db = { user: { findFirst: async () => null, findMany: async () => [] } };
  await assert.rejects(findSupportUser(db, "#7123412d-a"), /user not found/);
});

test("exact email and shop-name lookup are preserved", async () => {
  for (const identifier of ["person@example.test", "My Shop"]) {
    const db = { user: { findFirst: async ({ where }) => {
      assert.equal(where.OR[1].email, identifier);
      assert.equal(where.OR[2].sellerProfile.shopName, identifier);
      return { id };
    } } };
    assert.equal((await findSupportUser(db, identifier)).id, id);
  }
});

test("short prefixes and empty inputs do not trigger broad ID searches", async () => {
  const db = { user: { findFirst: async () => null, findMany: async () => { throw new Error("unexpected prefix lookup"); } } };
  await assert.rejects(findSupportUser(db, "7123"), /user not found/);
  await assert.rejects(findSupportUser(db, "  "), /required/);
});
