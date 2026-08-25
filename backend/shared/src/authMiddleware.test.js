const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const { signAccessToken } = require("./jwt");
const { requireAuth, requirePermission } = require("./authMiddleware");

test("requireAuth exposes the display name from a verified access token", () => {
  const token = signAccessToken({
    sub: "seller-1",
    role: "SELLER",
    displayName: "Trusted Seller",
  });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {};
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.userId, "seller-1");
  assert.equal(req.userRole, "SELLER");
  assert.equal(req.userDisplayName, "Trusted Seller");
});

test("requireAuth uses null when an older access token has no display name", () => {
  const token = signAccessToken({ sub: "seller-1", role: "SELLER" });
  const req = { headers: { authorization: `Bearer ${token}` } };

  requireAuth(req, {}, () => {});

  assert.equal(req.userDisplayName, null);
});

test("requireAuth falls back to a single-item roles array for a legacy token", () => {
  const token = signAccessToken({ sub: "seller-1", role: "SELLER" });
  const req = { headers: { authorization: `Bearer ${token}` } };

  requireAuth(req, {}, () => {});

  assert.deepEqual(req.userRoles, ["SELLER"]);
  assert.deepEqual(req.permissions, []);
});

test("requireAuth reads multi-role claims when present", () => {
  const token = signAccessToken({
    sub: "staff-1",
    role: "ADMIN",
    roles: ["ADMIN", "CUSTOMER_SERVICE"],
    permissions: ["admin:user:ban", "support:case:read"],
  });
  const req = { headers: { authorization: `Bearer ${token}` } };

  requireAuth(req, {}, () => {});

  assert.deepEqual(req.userRoles, ["ADMIN", "CUSTOMER_SERVICE"]);
  assert.deepEqual(req.permissions, ["admin:user:ban", "support:case:read"]);
});

test("requirePermission allows a matching permission through", () => {
  const req = { permissions: ["admin:user:ban"] };
  let nextCalled = false;

  requirePermission("admin:user:ban")(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requirePermission returns a structured 403 for a missing permission", () => {
  const req = { permissions: ["support:case:read"], id: "req-1" };
  let statusCode;
  let body;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
    },
  };

  requirePermission("admin:user:ban")(req, res, () => {
    throw new Error("next should not be called");
  });

  assert.equal(statusCode, 403);
  assert.deepEqual(body, {
    error: { code: "FORBIDDEN", message: "Forbidden", requestId: "req-1" },
  });
});