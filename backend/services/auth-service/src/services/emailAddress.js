const { badRequest } = require("@reloop/shared");

const MAX_EMAIL_LENGTH = 254; // RFC 5321 path limit
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trims and shape-checks an address. Case is preserved: accounts are looked
 * up by exact email, the same way sign-in does.
 */
function normalizeEmail(email) {
  if (typeof email !== "string") throw badRequest("A valid email is required.");
  const trimmed = email.trim();
  if (trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(trimmed)) {
    throw badRequest("A valid email is required.");
  }
  return trimmed;
}

module.exports = { normalizeEmail };
