function disputeCapabilities(dispute, userId, role, roles = []) {
  const heldRoles = new Set([role, ...roles]);
  const admin = heldRoles.has("ADMIN");
  const ts = heldRoles.has("TRUST_AND_SAFETY");
  const cs = heldRoles.has("CUSTOMER_SERVICE");
  const owner = dispute.assignedTo === userId;
  const live = dispute.status !== "DECIDED";
  const accessible =
    admin ||
    ts ||
    (cs && dispute.assignedRole !== "ADMIN" && (!dispute.assignedTo || owner));
  const team = dispute.assignedRole;
  return {
    canViewDetail: accessible,
    canClaim:
      accessible &&
      live &&
      !dispute.assignedTo &&
      (!admin || team === "ADMIN") &&
      (team !== "ADMIN" || admin) &&
      (team !== "TRUST_AND_SAFETY" || ts),
    canReply:
      accessible &&
      live &&
      owner &&
      cs &&
      !admin &&
      !ts &&
      team !== "TRUST_AND_SAFETY",
    canEscalate: accessible && live && team !== "ADMIN" && (owner || ts),
    canReassign:
      accessible &&
      live &&
      (owner || ts || admin) &&
      (team !== "ADMIN" || admin) &&
      (team !== "TRUST_AND_SAFETY" || ts),
    canDecide: live && admin && team === "ADMIN" && owner,
    canRequestEvidence: live && admin && team === "ADMIN" && owner,
    readOnlyReason: !live
      ? "ข้อพิพาทนี้ตัดสินแล้ว"
      : admin || ts
        ? "ดูประวัติสนทนาแบบอ่านอย่างเดียว"
        : !owner
          ? "รับเคสก่อนเริ่มสนทนา"
          : null,
  };
}
module.exports = { disputeCapabilities };
