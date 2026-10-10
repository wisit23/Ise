const test = require("node:test");
const assert = require("node:assert/strict");
const { dashboardOptions } = require("./agentDashboard");

test("agent dashboard rejects non-CS identities and client supplied identity does not override session", () => {
  for (const role of [
    "BUYER",
    "SELLER",
    "ADMIN",
    "TRUST_AND_SAFETY",
    undefined,
  ]) {
    assert.throws(
      () => dashboardOptions({ userRole: role, userId: "a", query: {} }),
      { status: 403 },
    );
  }
  assert.deepEqual(
    dashboardOptions({
      userRole: "BUYER",
      userRoles: ["CUSTOMER_SERVICE"],
      userId: "a",
      query: { userId: "b", scope: "all" },
    }),
    { userId: "a", focus: "all", page: 1, days: 14 },
  );
});

test("dashboard validates focus and bounded positive integer pagination", () => {
  const req = { userRole: "CUSTOMER_SERVICE", userId: "a" };
  for (const days of ["0", "60", "NaN", ["7", "30"]]) {
    assert.throws(() => dashboardOptions({ ...req, query: { days } }), {
      status: 400,
    });
  }
  for (const page of [
    "0",
    "-1",
    "1.5",
    "Infinity",
    "1000000",
    "1 OR 1=1",
    ["1", "2"],
  ]) {
    assert.throws(() => dashboardOptions({ ...req, query: { page } }), {
      status: 400,
    });
  }
  assert.throws(() => dashboardOptions({ ...req, query: { focus: "team" } }), {
    status: 400,
  });
  assert.equal(
    dashboardOptions({ ...req, query: { focus: "soon", page: "2" } }).page,
    2,
  );
});
