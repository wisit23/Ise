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
    (cs && !["ADMIN", "TRUST_AND_SAFETY"].includes(dispute.assignedRole) && (!dispute.assignedTo || owner));
  const team = dispute.assignedRole;
  // The CS agent who escalated keeps a read-only view while T&S reviews.
  const watching =
    cs && !admin && !ts && live &&
    dispute.escalatedBy === userId &&
    ["ADMIN", "TRUST_AND_SAFETY"].includes(team);
  return {
    canViewDetail: accessible || watching,
    isWatching: watching,
    isReturned:
      live && team === "CUSTOMER_SERVICE" && Boolean(dispute.returnedAt),
    canClaim:
      accessible &&
      live &&
      !dispute.assignedTo &&
      (!admin || ["ADMIN", "TRUST_AND_SAFETY"].includes(team)) &&
      (team !== "ADMIN" || admin) &&
      (team !== "TRUST_AND_SAFETY" || ts || admin),
    canReply:
      accessible &&
      live &&
      owner &&
      cs &&
      !admin &&
      !ts &&
      team !== "TRUST_AND_SAFETY",
    canEscalate: accessible && live && !["ADMIN", "TRUST_AND_SAFETY"].includes(team) && owner && cs && !ts && !admin,
    canReassign:
      accessible &&
      live &&
      (owner || ts || admin) &&
      (team !== "ADMIN" || admin) &&
      (team !== "TRUST_AND_SAFETY" || ts || admin),
    canDecide: live && owner && ((admin && team === "ADMIN") || ((ts || admin) && team === "TRUST_AND_SAFETY")),
    canRequestEvidence: live && owner && ((admin && team === "ADMIN") || ((ts || admin) && team === "TRUST_AND_SAFETY")),
    readOnlyReason: !live
      ? "ข้อพิพาทนี้ตัดสินแล้ว"
      : watching
        ? "ส่งต่อให้ Trust & Safety แล้ว ดูได้อย่างเดียวระหว่างรอตรวจ"
      : admin || ts
        ? "ดูประวัติสนทนาแบบอ่านอย่างเดียว"
        : !owner
          ? "รับเคสก่อนเริ่มสนทนา"
          : null,
  };
}
module.exports = { disputeCapabilities };
