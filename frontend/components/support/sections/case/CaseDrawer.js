"use client";

import Badge from "../../../panel/ui/Badge";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
} from "../../../../lib/supportConstants";

/* The slide-over shell: backdrop, exit animation, header. Not built on
   components/ui/Modal because this one animates out on close (the caller
   holds `closing` for the duration of the transition) and Modal unmounts
   immediately — worth revisiting once Modal grows an exit transition. */
export default function CaseDrawer({ ticket, closing, onClose, children }) {
  if (!ticket) return null;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
      className={`fixed inset-0 z-drawer flex justify-end bg-slate-900/50 backdrop-blur-sm ${
        closing ? "animate-fade-out" : "animate-fade-in"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ticket.subject}
        className={`flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl ${
          closing ? "animate-slide-out-right" : "animate-slide-in-right"
        }`}
      >
        <div className="flex items-start justify-between border-b border-slate-100 bg-white px-7 py-5">
          <div className="min-w-0 flex-1 pr-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-600">
                {ticket.ticketNumber}
              </span>
              <Badge
                text={TICKET_STATUS_LABEL[ticket.status] || ticket.status}
                style={
                  TICKET_STATUS_STYLE[ticket.status] ||
                  "bg-slate-100 text-slate-600"
                }
              />
              <Badge
                text={PRIORITY_LABEL[ticket.priority] || ticket.priority}
                style={
                  PRIORITY_STYLE[ticket.priority] ||
                  "bg-slate-100 text-slate-600"
                }
              />
            </div>
            <h2 className="text-base font-bold leading-tight text-slate-900">
              {ticket.subject}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิดหน้าต่างเคส"
            className="focus-ring flex aspect-square h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <span className="material-symbols-outlined block text-[20px] leading-none">
              close
            </span>
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
