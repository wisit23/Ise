"use client";

import EmbeddedChat from "../../EmbeddedChat";

/** Real-time chat panel that slides in beside the dispute detail drawer.
 * Replaces the previous placeholder mock — now powered by chat-service
 * via EmbeddedChat. */
export default function DisputeChatPanel({
  dispute,
  conversationId,
  closing,
  onClose,
}) {
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
          {!conversationId && (
            <p className="text-xs font-medium text-slate-400">
              ยังไม่มีห้องแชท
            </p>
          )}
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

      <div className="flex flex-1 flex-col overflow-hidden">
        <EmbeddedChat
          conversationId={conversationId}
          maxHeight="100%"
        />
      </div>
    </div>
  );
}
