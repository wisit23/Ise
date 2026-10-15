"use client";

import useCaseUnread from "./useCaseUnread";

export default function WorkspaceUnreadBadge({ domain, token, account, active, collapsed }) {
  const { summary } = useCaseUnread(domain, token, account);
  const count = summary?.scopes?.all;
  if (!Number.isSafeInteger(count) || count <= 0) return null;

  return (
    <span
      className={collapsed
        ? `absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${active ? "bg-white/80" : "bg-slate-400"}`
        : `ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}
    >
      <span className="sr-only">ข้อความยังไม่อ่าน {count} ข้อความ</span>
      {!collapsed && <span aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </span>
  );
}