"use client";

import Link from "next/link";
import {
  hasUnread,
  otherParticipant,
  participantRoleLabel,
} from "../../lib/chat";

/** The other participant's display name comes down with the conversation
 * itself — chat-service resolves it server-side for the participants of
 * rooms this user is already in (see chat-service/src/services/authClient.js).
 */
export default function ConversationRow({
  conversation,
  currentUserId,
  isActive = false,
  isOnline = false,
  onSelect,
}) {
  const other = otherParticipant(conversation, currentUserId);
  const otherName = other?.displayName || "ผู้ใช้";
  const roleLabel = participantRoleLabel(other?.role);
  const unread = !isActive && hasUnread(conversation, currentUserId);

  const timeFormatted = conversation.lastMessageAt
    ? new Date(conversation.lastMessageAt).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  function handleClick(e) {
    if (onSelect) {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        (e.button !== undefined && e.button !== 0)
      )
        return;
      e.preventDefault();
      onSelect(conversation.id);
    }
  }

  return (
    <li className="list-none" data-conversation-id={conversation.id}>
      <Link
        href={`/chat/${conversation.id}`}
        onClick={handleClick}
        className={`group relative flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-200 ${
          isActive
            ? "bg-emerald-50/80 text-emerald-950 font-medium"
            : "hover:bg-slate-50/80 text-slate-700"
        }`}
      >
        {/* Left Active Indicator Bar (fallback for mobile) */}
        {isActive && (
          <span
            className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-emerald-600 md:hidden"
            aria-hidden="true"
          />
        )}

        {/* Avatar with status indicator */}
        <div className="relative shrink-0">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold shadow-2xs transition-transform duration-200 group-hover:scale-105 ${
              isActive
                ? "bg-emerald-600 text-white"
                : "bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-800"
            }`}
          >
            {otherName[0]?.toUpperCase() || "?"}
          </div>
          {/* Online green indicator dot - shown only when isOnline */}
          {isOnline && (
            <span
              data-testid="online-indicator"
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 shadow-2xs"
              aria-hidden="true"
              title="ออนไลน์"
            />
          )}
        </div>

        {/* Info Column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p
                className={`truncate text-sm ${
                  unread
                    ? "font-bold text-gray-900"
                    : isActive
                      ? "font-semibold text-emerald-900"
                      : "font-medium text-gray-800"
                }`}
              >
                {otherName}
              </p>
              {roleLabel && (
                <span className="shrink-0 rounded-full bg-gray-100/90 border border-gray-200/50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {roleLabel}
                </span>
              )}
            </div>

            {/* Timestamp & Unread */}
            <div className="flex items-center gap-1.5 shrink-0">
              {timeFormatted && (
                <span className="text-[11px] text-gray-400 font-mono">
                  {timeFormatted}
                </span>
              )}
              {unread && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600 ring-2 ring-emerald-100"
                  role="status"
                  aria-label="มีข้อความใหม่"
                />
              )}
            </div>
          </div>

          <p
            className={`truncate text-xs ${
              unread
                ? "font-medium text-gray-800"
                : "text-gray-400 group-hover:text-gray-600"
            }`}
          >
            {conversation.lastMessagePreview || "เริ่มการสนทนา"}
          </p>
        </div>
      </Link>
    </li>
  );
}
