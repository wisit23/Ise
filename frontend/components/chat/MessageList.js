"use client";

import { useRef } from "react";
import MessageAttachment from "./MessageAttachment";

const QUICK_PROMPTS = [
  "สินค้ายังอยู่ไหมครับ?",
  "ลดราคาได้ไหมครับ?",
  "ขอดูรูปเพิ่มเติมหน่อยครับ",
  "สภาพสินค้าเป็นอย่างไรบ้างครับ?",
];

/** Pure presentation — expects `messages` already sorted oldest-to-newest
 * (callers reverse the backend's newest-first pages before passing them in;
 * see lib/chat.js's listMessages doc comment). */
export default function MessageList({
  messages,
  currentUserId,
  otherName = "ผู้ใช้",
  onPromptClick,
  activeRoomId,
}) {
  const animatedIdsRef = useRef(new Set());
  const initialIdsRef = useRef(null);
  const prevRoomRef = useRef(activeRoomId);
  const lastOptimisticRef = useRef({ body: null, time: 0 });
  const oldestTimeRef = useRef(null);

  // When room changes, reset tracking
  if (prevRoomRef.current !== activeRoomId) {
    prevRoomRef.current = activeRoomId;
    initialIdsRef.current = null;
    animatedIdsRef.current = new Set();
    oldestTimeRef.current = null;
  }

  // On first non-empty render of a room, mark historical messages as seen
  // (leaving the latest message so it can animate on enter)
  if (initialIdsRef.current === null && messages.length > 0) {
    initialIdsRef.current = new Set(messages.map((m) => m.id));
    messages.slice(0, -1).forEach((m) => animatedIdsRef.current.add(m.id));
    const firstTime = new Date(messages[0].createdAt).getTime();
    oldestTimeRef.current = Number.isNaN(firstTime) ? null : firstTime;
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-12 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 shadow-xs mb-3 animate-fade-in">
          <span className="material-symbols-outlined text-[32px]">
            chat_bubble
          </span>
        </div>
        <p className="text-sm font-medium text-gray-700">
          ยังไม่มีข้อความ เริ่มทักได้เลย
        </p>
        <p className="mt-1 text-xs text-gray-400">
          ทักทาย สอบถามข้อมูลสินค้า หรือต่อรองราคากับคู่สนทนา
        </p>

        {onPromptClick && (
          <div className="mt-6 flex max-w-md flex-wrap justify-center gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onPromptClick(prompt)}
                className="rounded-full border border-emerald-200/80 bg-white px-3.5 py-1.5 text-xs font-medium text-emerald-700 shadow-xs transition hover:border-emerald-400 hover:bg-emerald-50 active:scale-95"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col py-3 px-1">
      {messages.map((m, index) => {
        if (m.type === "SYSTEM") {
          return (
            <li key={m.id} className="my-2.5 text-center animate-fade-in">
              <span className="rounded-full bg-gray-100/90 border border-gray-200/60 px-3.5 py-1 text-[11px] font-medium text-gray-500 shadow-2xs">
                {m.body}
              </span>
            </li>
          );
        }

        const own = m.senderId === currentUserId;
        const prevMsg = messages[index - 1];
        const nextMsg = messages[index + 1];

        const isSameSenderPrev =
          prevMsg &&
          prevMsg.type !== "SYSTEM" &&
          prevMsg.senderId === m.senderId &&
          new Date(m.createdAt) - new Date(prevMsg.createdAt) < 2 * 60 * 1000;

        const isSameSenderNext =
          nextMsg &&
          nextMsg.type !== "SYSTEM" &&
          nextMsg.senderId === m.senderId &&
          new Date(nextMsg.createdAt) - new Date(m.createdAt) < 2 * 60 * 1000;

        const isLastInGroup = !isSameSenderNext;
        const isFirstInGroup = !isSameSenderPrev;

        const isOptimistic = String(m.id).startsWith("optimistic-");
        const msgTime = new Date(m.createdAt).getTime();
        const isOlderHistory =
          oldestTimeRef.current !== null &&
          !Number.isNaN(msgTime) &&
          msgTime < oldestTimeRef.current;

        const msgKey = m.clientId || m.id;
        let shouldAnimate = false;

        if (isOlderHistory) {
          // Older history prepended at the top — do not animate
          animatedIdsRef.current.add(msgKey);
          animatedIdsRef.current.add(m.id);
          oldestTimeRef.current = Math.min(oldestTimeRef.current, msgTime);
        } else if (isOptimistic) {
          if (!animatedIdsRef.current.has(msgKey)) {
            animatedIdsRef.current.add(msgKey);
            animatedIdsRef.current.add(m.id);
            shouldAnimate = true;
            lastOptimisticRef.current = { body: m.body, time: Date.now() };
          }
        } else if (
          !animatedIdsRef.current.has(msgKey) &&
          !animatedIdsRef.current.has(m.id)
        ) {
          animatedIdsRef.current.add(msgKey);
          animatedIdsRef.current.add(m.id);
          shouldAnimate = true;
        }

        return (
          <li
            key={m.clientId || m.id}
            className={`flex items-end gap-2 ${
              own ? "justify-end" : "justify-start"
            } ${isFirstInGroup ? "mt-3" : "mt-1"}`}
          >
            {/* Receiver Avatar on the left */}
            {!own && (
              <div className="w-7 shrink-0 mb-0.5">
                {isLastInGroup ? (
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-xs font-semibold shadow-2xs animate-fade-in"
                    title={otherName}
                  >
                    {otherName?.[0] || "?"}
                  </div>
                ) : (
                  <div className="h-7 w-7" />
                )}
              </div>
            )}

            {/* Bubble */}
            <div
              data-testid="message-bubble"
              data-animate={shouldAnimate ? "pop" : "none"}
              className={`relative max-w-[78%] sm:max-w-[70%] px-4 py-2.5 text-sm transition-all duration-150 ${
                shouldAnimate ? "animate-message-pop" : ""
              } ${
                own
                  ? "origin-bottom-right bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs " +
                    (isLastInGroup
                      ? "rounded-2xl rounded-br-xs"
                      : "rounded-2xl rounded-r-md")
                  : "origin-bottom-left bg-white border border-gray-150 text-gray-900 shadow-xs " +
                    (isLastInGroup
                      ? "rounded-2xl rounded-bl-xs"
                      : "rounded-2xl rounded-l-md")
              }`}
            >
              {(m.type === "IMAGE" || m.type === "FILE") && (
                <div className={m.body ? "mb-2" : ""}>
                  <MessageAttachment message={m} own={own} />
                </div>
              )}

              {m.body && (
                <p className="whitespace-pre-line leading-relaxed selection:bg-emerald-200 selection:text-emerald-950">
                  {m.body}
                </p>
              )}

              {/* Timestamp & Status */}
              <div
                className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                  own ? "text-emerald-100/90" : "text-gray-400"
                }`}
              >
                <span>
                  {new Date(m.createdAt).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>

                {own && (
                  <span
                    className="material-symbols-outlined text-[13px] leading-none"
                    title={isOptimistic ? "กำลังส่ง..." : "ส่งแล้ว"}
                    aria-hidden="true"
                  >
                    {isOptimistic ? "schedule" : "done_all"}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
