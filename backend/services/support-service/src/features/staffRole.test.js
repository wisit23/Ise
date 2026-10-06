const test = require("node:test");
const assert = require("node:assert/strict");
const { effectiveStaffRole } = require("./staffRole");

test("staff role may be secondary in the verified token", () => {
  assert.equal(
    effectiveStaffRole({
      userRole: "BUYER",
      userRoles: ["BUYER", "CUSTOMER_SERVICE"],
    }),
    "CUSTOMER_SERVICE",
  );
  assert.equal(
    effectiveStaffRole({ userRole: "BUYER", userRoles: ["BUYER", "ADMIN"] }),
    "ADMIN",
  );
  assert.equal(
    effectiveStaffRole({ userRole: "BUYER", userRoles: ["BUYER"] }),
    "BUYER",
  );
});
