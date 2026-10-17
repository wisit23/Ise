const { TRANSITIONS } = require("./ticketState");
function ticketCapabilities(ticket, userId, role) {
  const closed = ticket.status === "CLOSED";
  const owner = ticket.assigneeId === userId;
  const responder = role === "CUSTOMER_SERVICE" && ticket.chatResponderId === userId;
  const elevated = ["ADMIN", "TRUST_AND_SAFETY"].includes(role);
  const accessible =
    elevated || responder ||
    (role === "CUSTOMER_SERVICE" &&
      ticket.status !== "ESCALATED" &&
      (!ticket.assigneeId || owner));
  const mutable = accessible && !closed && (owner || elevated) && !(role === "CUSTOMER_SERVICE" && ticket.status === "ESCALATED");
  return {
    canViewDetail: accessible,
    canModerateUsers: elevated && owner && !["CLOSED", "RESOLVED"].includes(ticket.status),
    canClaim: accessible && !closed && !ticket.assigneeId,
    canTakeover: elevated && !closed && ticket.status === "ESCALATED" && Boolean(ticket.assigneeId) && !owner,
    canReply: !closed && role === "CUSTOMER_SERVICE" && (responder || (mutable && owner)),
    canAddNote: mutable || (!closed && responder),
    canChangeStatus: mutable && owner,
    canClose: mutable && owner && (TRANSITIONS[ticket.status] || []).includes("CLOSED"),
    allowedNextStatuses: mutable && owner
      ? (TRANSITIONS[ticket.status] || []).filter((s) => s !== "ASSIGNED")
      : [],
    canEscalate:
      mutable && owner && (TRANSITIONS[ticket.status] || []).includes("ESCALATED"),
    readOnlyReason: closed
      ? "เคสนี้ปิดแล้ว"
      : !accessible
        ? "คุณไม่มีสิทธิ์เปิดเคสนี้"
        : !owner && !responder
          ? "รับเคสก่อนเริ่มตอบลูกค้า"
          : null,
  };
}
module.exports = { ticketCapabilities };
