"use client";

import { Fragment } from "react";

const ROLE_LABELS = {
  BUYER: "ผู้ซื้อ",
  SELLER: "ผู้ขาย",
  AGENT: "เจ้าหน้าที่",
  ADMIN: "เจ้าหน้าที่ Trust & Safety",
  TRUST_AND_SAFETY: "เจ้าหน้าที่ Trust & Safety",
  SYSTEM: "ระบบ",
};

function sentAt(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "ไม่ทราบวันเวลาส่ง";
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function AuditChatMessages({ messages }) {
  return (
    <ul aria-label="ข้อความแชทย้อนหลัง" className="space-y-4 p-4">
      {messages.map((message, index) => {
        const date = sentAt(message.createdAt).split(" ")[0];
        const previousDate =
          index > 0
            ? sentAt(messages[index - 1].createdAt).split(" ")[0]
            : null;
        const staff = ["AGENT", "ADMIN", "TRUST_AND_SAFETY"].includes(
          message.senderRole,
        );
        const system =
          message.type === "SYSTEM" || message.senderRole === "SYSTEM";
        const label =
          ROLE_LABELS[message.senderRole] || message.senderRole || "ผู้ใช้";
        return (
          <Fragment key={message.id}>
            {date !== previousDate && (
              <li
                role="separator"
                aria-label={`วันที่ ${date}`}
                className="flex items-center gap-3 py-2 text-[11px] text-slate-500"
              >
                <span className="h-px flex-1 bg-slate-200" />
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  {date}
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </li>
            )}
            {system ? (
              <li className="flex justify-center">
                <div className="max-w-[90%] rounded-2xl border border-slate-200/60 bg-slate-100 px-4 py-2 text-center text-xs text-slate-500">
                  <p className="whitespace-pre-wrap break-words">
                    {message.body || `[${message.type}]`}
                  </p>
                  <p className="mt-1 text-[10px]">
                    {sentAt(message.createdAt)}
                  </p>
                </div>
              </li>
            ) : (
              <li
                className={`flex items-end gap-2 ${staff ? "justify-end" : "justify-start"}`}
              >
                {!staff && (
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600"
                  >
                    {label[0]}
                  </span>
                )}
                <div
                  className={`min-w-0 max-w-[80%] rounded-2xl px-4 py-3 text-sm sm:max-w-[70%] ${staff ? "rounded-br-sm bg-gradient-to-r from-emerald-600 to-teal-600 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-900"}`}
                >
                  <p
                    className={`mb-1 text-[11px] font-semibold ${staff ? "text-emerald-100" : "text-slate-500"}`}
                  >
                    {label}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    {message.body || `[${message.type}]`}
                  </p>
                  <p
                    className={`mt-1 text-right text-[10px] ${staff ? "text-emerald-100" : "text-slate-400"}`}
                  >
                    {sentAt(message.createdAt)}
                  </p>
                </div>
              </li>
            )}
          </Fragment>
        );
      })}
    </ul>
  );
}
