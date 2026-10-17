import { INBOX_SOURCES } from "../../../lib/executiveInbox";
import { formatReportedAt } from "../../../lib/executiveComplaints";

// A ticket or a dispute in the complaints list. Complaints about a user or
// product have their own row (ComplaintRow); this one reads only what the
// services send for the page: no requester, no assignee, no chat.
export default function InboxItemRow({ item }) {
  return (
    <li className="px-5 py-4 transition-colors hover:bg-slate-50/50">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-snug text-slate-900">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
              {INBOX_SOURCES[item.source].label}
            </span>
            <span className="min-w-0 break-words">{item.title}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              {item.source === "ticket" ? "หมายเลข" : "ออเดอร์"}:{" "}
              <strong className="font-medium text-slate-700">
                {item.reference}
              </strong>
            </span>
            <span>
              วันที่แจ้ง:{" "}
              <strong className="font-medium text-slate-700">
                {formatReportedAt(item.createdAt)}
              </strong>
            </span>
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <span
          className={`shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${
            item.status.style ||
            "border border-slate-300 bg-slate-50 text-slate-600"
          }`}
        >
          {item.status.label}
        </span>
      </div>
    </li>
  );
}
