const { TRANSITIONS } = require("./ticketState");
function ticketCapabilities(ticket, userId, role) {
  const closed = ticket.status === "CLOSED";
  const owner = ticket.assigneeId === userId;
  const elevated = ["ADMIN", "TRUST_AND_SAFETY"].includes(role);
  const accessible =
    elevated ||
    (role === "CUSTOMER_SERVICE" &&
      ticket.status !== "ESCALATED" &&
      (!ticket.assigneeId || owner));
  const mutable = accessible && !closed && (owner || elevated);
  return {
    canViewDetail: accessible,
    canClaim: accessible && !closed && !ticket.assigneeId,
    canReply: mutable && owner && role === "CUSTOMER_SERVICE",
    canAddNote: mutable,
    canChangeStatus: mutable,
    allowedNextStatuses: mutable
      ? (TRANSITIONS[ticket.status] || []).filter((s) => s !== "ASSIGNED")
      : [],
    canEscalate:
      mutable && (TRANSITIONS[ticket.status] || []).includes("ESCALATED"),
    readOnlyReason: closed
      ? "เคสนี้ปิดแล้ว"
      : !accessible
        ? "คุณไม่มีสิทธิ์เปิดเคสนี้"
        : !owner
          ? "รับเคสก่อนเริ่มตอบลูกค้า"
          : null,
  };
}
module.exports = { ticketCapabilities };
