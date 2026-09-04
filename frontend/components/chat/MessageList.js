"use client";

import MessageAttachment from "./MessageAttachment";

/** Pure presentation — expects `messages` already sorted oldest-to-newest
 * (callers reverse the backend's newest-first pages before passing them in;
 * see lib/chat.js's listMessages doc comment). */
export default function MessageList({ messages, currentUserId }) {
  if (messages.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-400">
        ยังไม่มีข้อความ เริ่มทักได้เลย
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 py-2">
      {messages.map((m) => {
        if (m.type === "SYSTEM") {
          return (
            <li key={m.id} className="my-1 text-center">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                {m.body}
              </span>
            </li>
          );
        }
        const own = m.senderId === currentUserId;
        return (
          <li
            key={m.id}
            className={`flex ${own ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                own
                  ? "rounded-br-sm bg-emerald-600 text-white"
                  : "rounded-bl-sm bg-gray-100 text-gray-900"
              }`}
            >
              {(m.type === "IMAGE" || m.type === "FILE") && (
                <div className={m.body ? "mb-1.5" : ""}>
                  <MessageAttachment message={m} own={own} />
                </div>
              )}
              {/* An attachment's caption is optional, so an empty body must
                  not render an empty paragraph that adds stray spacing. */}
              {m.body && <p className="whitespace-pre-line">{m.body}</p>}
              <p
                className={`mt-1 text-right text-[10px] ${own ? "text-emerald-100" : "text-gray-400"}`}
              >
                {new Date(m.createdAt).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
