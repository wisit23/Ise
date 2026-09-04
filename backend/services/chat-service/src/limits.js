/**
 * Chat's own usage limits, in one place so the enforcement points and the
 * tests can't drift from each other.
 *
 * Before this file existed the only thing standing between a caller and an
 * arbitrarily long message was `express.json()`'s default 100 KB body cap —
 * an accident of the framework's defaults, not a decision. A 30,000-character
 * message was accepted and stored (verified against the running service),
 * which no chat bubble can render sanely.
 */

/** Characters, not bytes: Thai text is 3 bytes per character in UTF-8, so a
 * byte limit would quietly give Thai users a third of the room English users
 * get. `String.length` is what the composer's counter shows too. */
const MAX_MESSAGE_LENGTH = 4000;

/**
 * Overridable per limit so a test that seeds a long history through the
 * public API (message.integration.test.js posts 65 messages in under a
 * second — something no human does) can raise its own ceiling instead of the
 * production number being softened to accommodate it. Defaults are the real
 * values; an operator has to set the variable deliberately to change one.
 */
function budget(name, fallback) {
  const raw = Number(process.env[`CHAT_RATE_LIMIT_${name}`]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Per-user request budgets. Fixed windows, keyed by userId (never IP —
 * behind the gateway every request shares its address, so an IP limit would
 * throttle all users together). */
const RATE_LIMITS = {
  // A fast typist bursts a handful of short lines; 30 per 10s leaves that
  // untouched while stopping a scripted flood cold.
  sendMessage: { limit: budget("SEND_MESSAGE", 30), windowSeconds: 10 },
  // Each of these can be 10 MB of disk (attachmentStorage's cap), so this
  // one is about storage, not chattiness.
  uploadAttachment: {
    limit: budget("UPLOAD_ATTACHMENT", 10),
    windowSeconds: 60,
  },
  // Opening rooms is create-or-open, so a repeat click is idempotent — this
  // only needs to stop a script walking every productId to spray new rooms.
  createConversation: {
    limit: budget("CREATE_CONVERSATION", 20),
    windowSeconds: 60,
  },
};

module.exports = { MAX_MESSAGE_LENGTH, RATE_LIMITS };
