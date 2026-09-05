const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hasPermission,
  permissionsForRoles,
  ALL_ROLES,
} = require("./permissions");

test("hasPermission grants role-scoped actions", () => {
  assert.equal(hasPermission(["CUSTOMER_SERVICE"], "support:case:read"), true);
  assert.equal(hasPermission(["MARKETING"], "admin:user:ban"), false);
});

test("permissionsForRoles unions permissions across multiple roles", () => {
  const permissions = permissionsForRoles(["SELLER", "CUSTOMER_SERVICE"]);
  assert.ok(permissions.includes("product:write"));
  assert.ok(permissions.includes("support:case:read"));
  assert.equal(permissions.includes("admin:user:ban"), false);
});

test("unknown or missing roles grant no permissions", () => {
  assert.deepEqual(permissionsForRoles([]), []);
  assert.deepEqual(permissionsForRoles(["NOT_A_ROLE"]), []);
  assert.equal(hasPermission(["NOT_A_ROLE"], "admin:user:ban"), false);
});

test("catalog covers every contract role from integration.md", () => {
  assert.deepEqual(
    [...ALL_ROLES].sort(),
    [
      "ADMIN",
      "BUYER",
      "CUSTOMER_SERVICE",
      "EXECUTIVE",
      "MARKETING",
      "SELLER",
    ].sort(),
  );
});
