const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require("./jwt");

test("signAccessToken produces a token verifyAccessToken can read back", () => {
  const token = signAccessToken({ sub: "user-1", role: "BUYER" });
  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, "user-1");
  assert.equal(payload.role, "BUYER");
});

test("signRefreshToken produces a token verifyRefreshToken can read back", () => {
  const token = signRefreshToken({ sub: "user-2", role: "SELLER" });
  const payload = verifyRefreshToken(token);
  assert.equal(payload.sub, "user-2");
  assert.equal(payload.role, "SELLER");
});

test("verifyAccessToken rejects a token signed with a different secret", () => {
  const token = signAccessToken({ sub: "user-3", role: "BUYER" });
  const originalSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "a-different-secret";
  assert.throws(() => verifyAccessToken(token));
  process.env.JWT_ACCESS_SECRET = originalSecret;
});
