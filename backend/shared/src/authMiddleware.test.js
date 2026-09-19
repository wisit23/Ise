const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const { signAccessToken } = require("./jwt");
const { requireAuth, requirePermission } = require("./authMiddleware");
const { sessionError } = require("./sessionValidation");

test("requireAuth never attaches identity or calls next for a denied session", async () => {
  for (const error of [
    sessionError(403, "ACCOUNT_SUSPENDED", "suspended"),
    sessionError(401, "SESSION_REVOKED", "revoked"),
    new Error("database unavailable"),
  ]) {
    const req = {
      headers: {
        authorization: `Bearer ${signAccessToken({ sub: "buyer-1" })}`,
      },
      app: {
        locals: {
          validateAccessSession: async () => {
            throw error;
          },
        },
      },
    };
    let status;
    const res = {
      status(value) {
        status = value;
        return this;
      },
      json() {},
    };
    await requireAuth(req, res, () =>
      assert.fail("denied session reached handler"),
    );
    assert.equal(status, error.status || 503);
    assert.equal(req.userId, undefined);
  }
});

test("requireAuth exposes the display name from a verified access token", async () => {
  const token = signAccessToken({
    sub: "seller-1",
    role: "SELLER",
    displayName: "Trusted Seller",
  });
  const req = {
    headers: { authorization: `Bearer ${token}` },
    app: { locals: { validateAccessSession: async () => {} } },
  };
  const res = {};
  let nextCalled = false;

  await requireAuth(req, res, async () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.userId, "seller-1");
  assert.equal(req.userRole, "SELLER");
  assert.equal(req.userDisplayName, "Trusted Seller");
});

test("requireAuth uses null when an older access token has no display name", async () => {
  const token = signAccessToken({ sub: "seller-1", role: "SELLER" });
  const req = {
    headers: { authorization: `Bearer ${token}` },
    app: { locals: { validateAccessSession: async () => {} } },
  };

  await requireAuth(req, {}, async () => {});

  assert.equal(req.userDisplayName, null);
});

test("requireAuth falls back to a single-item roles array for a legacy token", async () => {
  const token = signAccessToken({ sub: "seller-1", role: "SELLER" });
  const req = {
    headers: { authorization: `Bearer ${token}` },
    app: { locals: { validateAccessSession: async () => {} } },
  };

  await requireAuth(req, {}, async () => {});

  assert.deepEqual(req.userRoles, ["SELLER"]);
  assert.deepEqual(req.permissions, []);
});

test("requireAuth reads multi-role claims when present", async () => {
  const token = signAccessToken({
    sub: "staff-1",
    role: "TRUST_AND_SAFETY",
    roles: ["TRUST_AND_SAFETY", "CUSTOMER_SERVICE"],
    permissions: ["admin:user:ban", "support:case:read"],
  });
  const req = {
    headers: { authorization: `Bearer ${token}` },
    app: { locals: { validateAccessSession: async () => {} } },
  };

  await requireAuth(req, {}, async () => {});

  assert.deepEqual(req.userRoles, ["TRUST_AND_SAFETY", "CUSTOMER_SERVICE"]);
  assert.deepEqual(req.permissions, ["admin:user:ban", "support:case:read"]);
});

test("requirePermission allows a matching permission through", async () => {
  const req = { permissions: ["admin:user:ban"] };
  let nextCalled = false;

  requirePermission("admin:user:ban")(req, {}, async () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requirePermission returns a structured 403 for a missing permission", async () => {
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

  requirePermission("admin:user:ban")(req, res, async () => {
    throw new Error("next should not be called");
  });

  assert.equal(statusCode, 403);
  assert.deepEqual(body, {
    error: { code: "FORBIDDEN", message: "Forbidden", requestId: "req-1" },
  });
});
