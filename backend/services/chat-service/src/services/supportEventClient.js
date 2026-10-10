// Compatibility facade. Keeping this thin avoids two implementations of the
// Chat-to-Ticket payload, timeout and retry rules.
const {
  deliverMessage,
  syncSupportMessage,
} = require("../features/sync/supportSyncWorker");

module.exports = { deliverMessage, syncSupportMessage };
