const test = require("node:test");
const assert = require("node:assert/strict");

let lockedUser;
let targetRoles;
let updatedStatus;
let auditInput;

const prisma = {
  $transaction: async (callback) => callback(prisma),
  user: {
    update: async ({ data }) => {
      updatedStatus = data.status;
      return { ...lockedUser, status: data.status };
    },
    findUnique: async () => lockedUser,
  },
  adminAudit: {
    create: async ({ data }) => {
      auditInput = data;
      return { id: "audit-1", createdAt: new Date(0), ...data };
    },
    findFirst: async () => null,
  },
};

const prismaPath = require.resolve("../src/models/prismaClient");
const sessionPath = require.resolve("../src/services/sessionService");
const authPath = require.resolve("../src/services/authService");

require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prisma,
};
require.cache[sessionPath] = {
  id: sessionPath,
  filename: sessionPath,
  loaded: true,
  exports: { lockUser: async () => lockedUser },
};
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { getUserRoles: async () => targetRoles },
};

const service = require("../src/features/commerceRestrictions/restrictionService");

test.beforeEach(() => {
  lockedUser = { id: "buyer-1", status: "ACTIVE" };
  targetRoles = ["BUYER"];
  updatedStatus = null;
  auditInput = null;
});

test("restrict persists buyer-only scope without invalidating login", async () => {
  const result = await service.restrict({
    targetId: "buyer-1",
    actorId: "admin-1",
    scope: "BUYER",
    reason: "confirmed abuse",
    requestId: "request-1",
  });

  assert.equal(updatedStatus, "RESTRICTED_BUYER");
  assert.deepEqual(result.commerceRestrictions, ["BUYER_COMMERCE"]);
  assert.equal(result.appealAvailable, true);
  assert.equal(result.appealSubmissionAvailable, false);
  assert.equal(auditInput.action, "COMMERCE_RESTRICTED_BUYER");
  assert.equal(auditInput.reason, "confirmed abuse");
});

test("seller scope can be added without losing an existing buyer scope", async () => {
  lockedUser = { id: "customer-1", status: "RESTRICTED_BUYER" };
  targetRoles = ["BUYER", "SELLER"];

  const result = await service.restrict({
    targetId: "customer-1",
    actorId: "admin-1",
    scope: "SELLER",
    reason: "seller violation",
  });

  assert.equal(updatedStatus, "RESTRICTED_ALL_COMMERCE");
  assert.deepEqual(result.commerceRestrictions, [
    "BUYER_COMMERCE",
    "SELLER_COMMERCE",
  ]);
});

test("revoke one scope preserves the other scope", async () => {
  lockedUser = { id: "customer-1", status: "RESTRICTED_ALL_COMMERCE" };

  const result = await service.revoke({
    targetId: "customer-1",
    actorId: "admin-1",
    scope: "BUYER",
    reason: "buyer appeal accepted",
  });

  assert.equal(updatedStatus, "RESTRICTED_SELLER");
  assert.deepEqual(result.commerceRestrictions, ["SELLER_COMMERCE"]);
  assert.equal(auditInput.action, "COMMERCE_RESTRICTION_REVOKED");
});

test("restriction rejects a scope the target role does not own", async () => {
  targetRoles = ["SELLER"];

  await assert.rejects(
    service.restrict({
      targetId: "buyer-1",
      actorId: "admin-1",
      scope: "BUYER",
      reason: "invalid target",
    }),
    (error) => error.status === 409,
  );
  assert.equal(updatedStatus, null);
});
