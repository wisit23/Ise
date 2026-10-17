"use client";
import Modal from "../../../ui/Modal";
import Badge from "../../../panel/ui/Badge";
import { TICKET_STATUS_LABEL, TICKET_STATUS_STYLE, PRIORITY_LABEL, PRIORITY_STYLE } from "../../../../lib/supportConstants";

export default function CaseDrawer({ ticket, closing, onClose, children }) {
  if (!ticket) return null;
  return (
    <Modal open onClose={onClose} title={ticket.subject || "รายละเอียดเคส"} description={ticket.ticketNumber} placement="fullscreen">
      <div className={"flex min-h-0 flex-1 flex-col " + (closing ? "animate-fade-out" : "")}>
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 sm:px-5">
          {ticket.status && <Badge text={TICKET_STATUS_LABEL[ticket.status] || ticket.status} style={TICKET_STATUS_STYLE[ticket.status] || "bg-slate-100 text-slate-600"} />}
          {ticket.priority && <Badge text={PRIORITY_LABEL[ticket.priority] || ticket.priority} style={PRIORITY_STYLE[ticket.priority] || "bg-slate-100 text-slate-600"} />}
        </div>
        {children}
      </div>
    </Modal>
  );
}
