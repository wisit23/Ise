// Daily job: deletes password-reset token rows past their retention period
// (PASSWORD_RESET_RETENTION_DAYS). Used/expired rows are kept until then as
// an audit trail of who requested and completed resets.
const passwordReset = require("../features/passwordReset");

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const START_DELAY_MS = 5 * 60 * 1000;

async function runCleanup() {
  try {
    const removed = await passwordReset.service.pruneExpired();
    if (removed > 0) {
      console.log(`[passwordResetCleanupJob] removed ${removed} old reset token(s)`);
    }
  } catch (err) {
    console.error("[passwordResetCleanupJob] cleanup failed:", err.message);
  }
}

function start() {
  setTimeout(() => {
    runCleanup();
    setInterval(runCleanup, RUN_INTERVAL_MS);
  }, START_DELAY_MS);
}

module.exports = { start, runCleanup };
