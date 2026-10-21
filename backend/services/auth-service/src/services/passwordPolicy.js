const bcrypt = require("bcryptjs");
const { badRequest } = require("@reloop/shared");

const PASSWORD_MIN_LENGTH = 8;
// bcrypt only reads the first 72 bytes; anything past that would be silently
// ignored, so a longer password is rejected instead of quietly truncated.
const PASSWORD_MAX_BYTES = 72;
const BCRYPT_ROUNDS = 10;

/** The one place every password-setting path (sign-up, reset) validates. */
function assertPasswordPolicy(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw badRequest(
      `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw badRequest(`password must be at most ${PASSWORD_MAX_BYTES} bytes`);
  }
}

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
  assertPasswordPolicy,
  hashPassword,
};
