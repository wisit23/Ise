const { wrapClient: wrapDisputes } = require("./disputeWorkflowClient");
const { wrapClient: wrapHistory } = require("./orderHistoryClient");

// Preserve historical audit formatting and address API shapes on the same
// client/transaction. Operational state is stored in columns and dedicated tables.
function wrapClient(prisma) {
  return wrapHistory(wrapDisputes(prisma));
}

module.exports = { wrapClient };
