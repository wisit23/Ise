// Compatibility facade for callers introduced before the sync worker moved
// under features/sync. All behavior and the event contract live in one place.
const worker = require("../features/sync/supportSyncWorker");

module.exports = {
  deliver: worker.deliverMessage,
  retryPending: worker.processPendingMessages,
  start: worker.startSupportSyncWorker,
  stop: worker.stopSupportSyncWorker,
  ...worker,
};
