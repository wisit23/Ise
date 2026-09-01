"use client";

import Button from "../../../ui/Button";

/* The requester card and the counterparty card were the same 45 lines of
   markup twice over, differing only in colour and heading. */
const TONES = {
  requester: {
    wrapper: "border-slate-200 bg-white",
    heading: "text-slate-500",
    avatar: "bg-gradient-to-br from-emerald-400 to-emerald-600",
  },
  target: {
    wrapper: "border-orange-200 bg-orange-50/40",
    heading: "text-orange-600",
    avatar: "bg-gradient-to-br from-orange-400 to-orange-600",
  },
};

export default function CaseUserCard({
  userId,
  heading,
  icon,
  tone = "requester",
  busy,
  onWarn,
  onBan,
}) {
  if (!userId) return null;
  const t = TONES[tone] ?? TONES.requester;

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${t.wrapper}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3
          className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${t.heading}`}
        >
          <span className="material-symbols-outlined text-[15px]">{icon}</span>
          {heading}
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon="warning"
            disabled={busy}
            onClick={() => onWarn(userId)}
            className="bg-amber-50 font-bold text-amber-700 hover:bg-amber-100 hover:text-amber-800"
          >
            ตักเตือน
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon="block"
            disabled={busy}
            onClick={() => onBan(userId)}
            className="bg-red-50 font-bold text-red-600 hover:bg-red-100 hover:text-red-700"
          >
            แบนผู้ใช้นี้
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow ${t.avatar}`}
        >
          {userId.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">
            รหัส: {userId.slice(0, 16)}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
            {userId}
          </p>
        </div>
      </div>
    </div>
  );
}
