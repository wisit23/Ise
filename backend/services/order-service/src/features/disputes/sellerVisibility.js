// A buyer opening a case does not yet involve the seller. Existing case logs
// preserve the handoff across reassignments without a separate workflow flag.
function isSellerVisible(dispute) {
  if (!dispute || dispute.deletedAt) return false;
  if (dispute.decision || ["DECIDED", "NEEDS_INFO"].includes(dispute.status)) return true;
  return (dispute.caseLog || dispute.auditLog || []).some((log) =>
    ["SELLER_CONTACTED", "REQUEST_MORE_EVIDENCE", "DECIDE"].includes(log.action));
}

module.exports = { isSellerVisible };
