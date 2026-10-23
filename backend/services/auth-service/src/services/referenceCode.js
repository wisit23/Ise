const crypto = require("crypto");

// No 0/O, 1/I/L or other look-alikes: people read this off a screen and
// compare it with an email, often on a phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * A short code ("K7Q-29") shown on the page that asked for an email and
 * printed in that email, so the user can tell the right message from an
 * older one or a lookalike. It proves nothing and grants nothing, so it is
 * safe to display; it is still random so it can't be predicted.
 */
function newReferenceCode() {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}`;
}

module.exports = { newReferenceCode };
