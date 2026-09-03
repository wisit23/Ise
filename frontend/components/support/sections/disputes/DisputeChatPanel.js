"use client";

/* Placeholder for the dispute chat that has not been built yet. It slides in
   to the left of the dispute panel, so it lives inside the same overlay. */
export default function DisputeChatPanel({ dispute, closing, onClose }) {
  const buyerId = dispute.order?.buyerId ?? "";
  const initial = buyerId.slice(0, 1).toUpperCase() || "B";

  return (
    <div
      className={`flex w-full max-w-sm flex-col border-r border-slate-200 bg-white shadow-xl ${
        closing ? "animate-slide-out-left" : "animate-slide-in-left"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">แชทกับผู้ซื้อ</h3>
          <p className="text-xs font-medium text-indigo-500">Coming Soon</p>
        </div>
        <button
          onClick={onClose}
          aria-label="ปิดหน้าต่างแชท"
          className="focus-ring flex aspect-square h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <span className="material-symbols-outlined block text-[20px] leading-none">
            close
          </span>
        </button>
      </div>

      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-xs font-bold text-white">
            {initial}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">ผู้ซื้อ</p>
            <p className="font-mono text-[10px] text-slate-500">
              {buyerId.slice(0, 16)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50/40 px-4 py-4">
        <div className="flex justify-center">
          <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Today
          </span>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-[10px] font-bold text-white">
            {initial}
          </div>
          <div className="max-w-[80%]">
            <p className="mb-1 ml-1 text-[10px] text-slate-500">ผู้ซื้อ</p>
            <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm">
              {dispute.reason}
            </div>
          </div>
        </div>

        <div className="flex flex-row-reverse items-end gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white">
            <span className="material-symbols-outlined text-[14px]">
              support_agent
            </span>
          </div>
          <div className="max-w-[80%]">
            <p className="mb-1 mr-1 text-right text-[10px] text-slate-500">
              เจ้าหน้าที่
            </p>
            <div className="rounded-2xl rounded-br-sm bg-emerald-600 px-3 py-2 text-xs text-white shadow-sm">
              รับทราบครับ เรากำลังพิจารณาเคสของคุณ
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-3 text-center">
          <p className="text-xs font-bold text-indigo-600">
            ระบบแชทเต็มรูปแบบ — Coming Soon
          </p>
          <p className="mt-0.5 text-[11px] text-indigo-500">
            ฟีเจอร์นี้กำลังพัฒนาอยู่
          </p>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 opacity-50">
          <span className="material-symbols-outlined text-[18px] text-slate-500">
            attach_file
          </span>
          <input
            disabled
            aria-label="พิมพ์ข้อความ (ยังไม่เปิดใช้งาน)"
            placeholder="ระบบแชทจะเปิดเร็วๆ นี้..."
            className="flex-1 cursor-not-allowed bg-transparent text-xs outline-none placeholder:text-slate-500"
          />
          <button
            disabled
            aria-label="ส่งข้อความ"
            className="flex items-center justify-center rounded-lg bg-emerald-600 p-1.5 text-white opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
