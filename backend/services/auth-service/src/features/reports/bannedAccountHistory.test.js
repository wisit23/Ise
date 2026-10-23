const test = require("node:test");
const assert = require("node:assert/strict");
const { listBannedAccountHistory } = require("./bannedAccountHistory");

test("ban history includes previous suspensions after restoration and returns only public account fields", async () => {
  const accounts = [
    { id: "customer-1", firstName: "Customer", lastName: "One", role: "BUYER", roles: [], status: "SUSPENDED", sellerProfile: null },
    { id: "store-1", firstName: "Seller", lastName: "One", role: "SELLER", roles: [{ role: "SELLER" }], status: "ACTIVE", sellerProfile: { shopName: "Restored Shop" } },
  ];
  let accountQuery, historyQuery, countQuery;
  const db = {
    user: { findMany: async (query) => { accountQuery = query; return accounts; } },
    adminAudit: {
      findMany: async (query) => {
        if (query.distinct) return accounts.map(({ id }) => ({ targetId: id }));
        historyQuery = query;
        return [{ id: "ban-1", targetId: "store-1", reason: "Fraud", createdAt: new Date(), actor: { firstName: "Staff" } }];
      },
      count: async (query) => { countQuery = query; return 12; },
    },
  };
  const result = await listBannedAccountHistory({ page: 2, limit: 10, role: "SELLER", search: "Restored" }, db);
  assert.equal(result.total, 12);
  assert.equal(result.items[0].account.status, "ACTIVE");
  assert.equal(result.items[0].account.sellerProfile.shopName, "Restored Shop");
  assert.equal(historyQuery.skip, 10);
  assert.equal(historyQuery.take, 10);
  assert.deepEqual(historyQuery.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(historyQuery.where.action, "USER_SUSPENDED");
  assert.deepEqual(historyQuery.where, countQuery.where);
  assert.deepEqual(accountQuery.where.AND[0].OR[0].roles.some.role.in, ["SELLER"]);
  assert.equal(accountQuery.where.AND[1].OR.at(-1).sellerProfile.is.shopName.contains, "Restored");
  assert.equal(accountQuery.select.passwordHash, undefined);
  assert.deepEqual(accountQuery.select.sellerProfile, { select: { shopName: true } });
  assert.equal("status" in accountQuery.where, false);
});

test("no suspensions returns empty history without looking up unrelated accounts", async () => {
  const db = { adminAudit: { findMany: async () => [] } };
  assert.deepEqual(await listBannedAccountHistory({ page: 1, limit: 10 }, db), { items: [], total: 0 });
  await assert.rejects(listBannedAccountHistory({ page: 1, limit: 10, role: "ADMIN" }, db), /invalid account role/);
});

test("customer filters are applied before counting and paging, including legacy role assignments", async () => {
  let accountQuery;
  const db = {
    adminAudit: { findMany: async () => [{ targetId: "staff-1" }] },
    user: { findMany: async (query) => { accountQuery = query; return []; } },
  };
  assert.deepEqual(await listBannedAccountHistory({ page: 1, limit: 10, role: "BUYER" }, db), { items: [], total: 0 });
  assert.deepEqual(accountQuery.where.AND[0].OR, [
    { roles: { some: { role: { in: ["BUYER"] } } } },
    { roles: { none: {} }, role: { in: ["BUYER"] } },
  ]);
});
