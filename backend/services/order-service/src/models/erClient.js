const { wrapClient: wrapDisputes } = require("./disputeWorkflowClient");
const { wrapClient: wrapHistory } = require("./orderHistoryClient");

// Keep both projections on the same client and interactive transaction.
// History must be outermost to hydrate orders included through dispute reads.
function wrapClient(prisma) {
  return wrapHistory(wrapDisputes(prisma));
}

module.exports = { wrapClient };
