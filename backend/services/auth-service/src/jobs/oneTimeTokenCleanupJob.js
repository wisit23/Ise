// Daily job: deletes emailed one-time token rows (password reset, email
// verification) past their retention period. Used and expired rows are kept
// until then as an audit trail of who requested and completed each flow.
const passwordReset = require("../features/passwordReset");
const emailVerification = require("../features/emailVerification");

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const START_DELAY_MS = 5 * 60 * 1000;

const FLOWS = [
  ["password reset", passwordReset.service],
  ["email verification", emailVerification.service],
];

async function runCleanup() {
  for (const [label, service] of FLOWS) {
    try {
      const removed = await service.pruneExpired();
      if (removed > 0) {
        console.log(`[oneTimeTokenCleanupJob] removed ${removed} old ${label} token(s)`);
      }
    } catch (err) {
      console.error(`[oneTimeTokenCleanupJob] ${label} cleanup failed:`, err.message);
    }
  }
}

function start() {
  setTimeout(() => {
    runCleanup();
    setInterval(runCleanup, RUN_INTERVAL_MS);
  }, START_DELAY_MS);
}

module.exports = { start, runCleanup };
