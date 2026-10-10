const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CAPABILITY,
  restrictionsForStatus,
  combineRestrictionStatus,
  removeRestrictionScope,
  requireCommerceCapability,
} = require("./commerceRestrictions");

test("maps durable user statuses to buyer and seller capabilities", () => {
  assert.deepEqual(restrictionsForStatus("ACTIVE"), []);
  assert.deepEqual(restrictionsForStatus("RESTRICTED_BUYER"), [
    CAPABILITY.BUYER,
  ]);
  assert.deepEqual(restrictionsForStatus("RESTRICTED_SELLER"), [
    CAPABILITY.SELLER,
  ]);
  assert.deepEqual(restrictionsForStatus("RESTRICTED_ALL_COMMERCE"), [
    CAPABILITY.BUYER,
    CAPABILITY.SELLER,
  ]);
});

test("commerce capability middleware blocks only its matching live scope", () => {
  const middleware = requireCommerceCapability(CAPABILITY.BUYER);
  let nextCalled = false;
  middleware({ commerceRestrictions: [CAPABILITY.SELLER] }, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  let responseStatus;
  let responseBody;
  middleware(
    { commerceRestrictions: [CAPABILITY.BUYER], id: "request-1" },
    {
      status(status) {
        responseStatus = status;
        return this;
      },
      json(body) {
        responseBody = body;
      },
    },
    () => assert.fail("restricted capability must not call next"),
  );
  assert.equal(responseStatus, 403);
  assert.equal(responseBody.error.code, "COMMERCE_RESTRICTED");
  assert.equal(responseBody.error.scope, CAPABILITY.BUYER);
});

test("combines and removes role-scoped restrictions without losing the other scope", () => {
  assert.equal(combineRestrictionStatus("ACTIVE", "BUYER"), "RESTRICTED_BUYER");
  assert.equal(
    combineRestrictionStatus("RESTRICTED_BUYER", "SELLER"),
    "RESTRICTED_ALL_COMMERCE",
  );
  assert.equal(
    removeRestrictionScope("RESTRICTED_ALL_COMMERCE", "BUYER"),
    "RESTRICTED_SELLER",
  );
  assert.equal(removeRestrictionScope("RESTRICTED_SELLER", "SELLER"), "ACTIVE");
});
