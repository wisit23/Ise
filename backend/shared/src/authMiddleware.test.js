const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const { signAccessToken } = require("./jwt");
const { requireAuth } = require("./authMiddleware");

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
