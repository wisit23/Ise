"use client";

import { useLayoutEffect, useRef } from "react";

/** Shared incoming-message bubble for marketplace and support chats. */
export default function TypingIndicator({ typing, name = "ผู้ใช้" }) {
  const bubbleRef = useRef(null);

  useLayoutEffect(() => {
    if (!typing) return;
    const bubble = bubbleRef.current;
    const scroller = bubble?.closest(".overflow-y-auto");
    if (!scroller) return;
    let frame;
    let previousHeight = -1;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Follow the expanding bubble, not its height before the transition.
        scroller.scrollTop = scroller.scrollHeight;
      });
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      const height = bubble.getBoundingClientRect().height;
      if (height > previousHeight) reveal();
      previousHeight = height;
    }) : null;
    observer?.observe(bubble);
    bubble.addEventListener("transitionend", reveal);
    reveal();
    return () => {
      observer?.disconnect();
      bubble.removeEventListener("transitionend", reveal);
      cancelAnimationFrame(frame);
    };
  }, [typing]);

  return (
    <div
      ref={bubbleRef}
      data-testid="typing-indicator-wrapper"
      className={`overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${typing ? "max-h-16 opacity-100 translate-y-0 py-2" : "max-h-0 opacity-0 -translate-y-1 py-0 pointer-events-none"}`}
      aria-hidden={!typing}
    >
      <div className="flex items-center gap-2 px-3" role={typing ? "status" : undefined} aria-label={typing ? `${name} กำลังพิมพ์` : undefined}>
        <div aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{name[0] || "?"}</div>
        <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
          {[0, 200, 400].map(delay => <span key={delay} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />)}
          <span className="ml-1 text-xs font-medium text-slate-500">กำลังพิมพ์...</span>
        </div>
      </div>
    </div>
  );
}
