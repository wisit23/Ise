const crypto = require("crypto");

// Emailed single-use credentials (password reset, email verification).
// 256 bits of randomness makes guessing infeasible, so no per-token attempt
// counter is needed; only the SHA-256 digest is ever stored, so a database
// leak cannot be replayed. A fast hash is fine here because the input is
// high-entropy random data, not a human-chosen password.
const TOKEN_BYTES = 32;
const MAX_TOKEN_LENGTH = 128;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** Shape check before hashing: anything else can never match a stored token. */
function isPlausibleToken(token) {
  return typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN_LENGTH;
}

/** Links carry the token in the URL fragment, which browsers never send to a server. */
function tokenLink(appBaseUrl, path, token) {
  return `${appBaseUrl}${path}#token=${token}`;
}

module.exports = { hashToken, newToken, isPlausibleToken, tokenLink };
