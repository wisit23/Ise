const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hasPermission,
  permissionsForRoles,
  ALL_ROLES,
  isValidRoleCombination,
  isCustomerAccount,
} = require("./permissions");

test("hasPermission grants role-scoped actions", () => {
  assert.equal(hasPermission(["CUSTOMER_SERVICE"], "support:case:read"), true);
  assert.equal(hasPermission(["MARKETING"], "admin:user:ban"), false);
});

test("permissionsForRoles unions permissions across multiple roles", () => {
  const permissions = permissionsForRoles(["BUYER", "SELLER"]);
  assert.ok(permissions.includes("product:write"));
  assert.ok(permissions.includes("order:purchase"));
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
      "TRUST_AND_SAFETY",
    ].sort(),
  );
});

test("customer accounts may combine BUYER and SELLER and may purchase", () => {
  assert.equal(isValidRoleCombination(["BUYER"]), true);
  assert.equal(isValidRoleCombination(["SELLER"]), true);
  assert.equal(isValidRoleCombination(["BUYER", "SELLER"]), true);
  assert.equal(isCustomerAccount(["BUYER", "SELLER"]), true);
  assert.equal(hasPermission(["SELLER"], "order:purchase"), true);
});

test("staff accounts allow exactly one staff role and never purchase", () => {
  assert.equal(isValidRoleCombination(["EXECUTIVE"]), true);
  assert.equal(isCustomerAccount(["EXECUTIVE"]), false);
  assert.equal(hasPermission(["EXECUTIVE"], "order:purchase"), false);
  assert.equal(isValidRoleCombination(["BUYER", "EXECUTIVE"]), false);
  assert.equal(
    isValidRoleCombination(["CUSTOMER_SERVICE", "TRUST_AND_SAFETY"]),
    false,
  );
});
