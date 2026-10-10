const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";

const { signAccessToken } = require("@reloop/shared");
const { verifySocketAuth } = require("./socketAuth");

function fakeSocket(token) {
  return { handshake: { auth: { token } }, data: {} };
}

test("handshake with no token is rejected", () => {
  const socket = fakeSocket(undefined);
  let error;
  verifySocketAuth(socket, (err) => {
    error = err;
  });
  assert.ok(error instanceof Error);
  assert.equal(error.message, "Unauthorized");
  assert.equal(socket.data.userId, undefined);
});

test("handshake with an empty-string token is rejected", () => {
  const socket = fakeSocket("");
  let error;
  verifySocketAuth(socket, (err) => {
    error = err;
  });
  assert.ok(error instanceof Error);
});

test("handshake with a malformed/tampered token is rejected", () => {
  const socket = fakeSocket("this-is-not-a-real-jwt");
  let error;
  verifySocketAuth(socket, (err) => {
    error = err;
  });
  assert.ok(error instanceof Error);
  assert.equal(error.message, "Unauthorized");
});

test("handshake with an expired token is rejected", () => {
  const expired = jwt.sign(
    { sub: "user-1", role: "BUYER" },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "-10s" },
  );
  const socket = fakeSocket(expired);
  let error;
  verifySocketAuth(socket, (err) => {
    error = err;
  });
  assert.ok(error instanceof Error);
  assert.equal(error.message, "Unauthorized");
});

test("handshake with a valid token succeeds and attaches userId/role", () => {
  const token = signAccessToken({ sub: "user-42", role: "SELLER" });
  const socket = fakeSocket(token);
  let error = "not-called";
  verifySocketAuth(socket, (err) => {
    error = err;
  });
  assert.equal(error, undefined);
  assert.equal(socket.data.userId, "user-42");
  assert.equal(socket.data.role, "SELLER");
});

test("a token signed with the wrong secret is rejected", () => {
  const token = jwt.sign({ sub: "user-1", role: "BUYER" }, "wrong-secret", {
    expiresIn: "15m",
  });
  const socket = fakeSocket(token);
  let error;
  verifySocketAuth(socket, (err) => {
    error = err;
  });
  assert.ok(error instanceof Error);
});
