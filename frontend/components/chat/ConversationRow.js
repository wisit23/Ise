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
 * Deliberately NOT a per-row lookup from the browser: an endpoint that turns
 * any userId into a name would let one logged-in account enumerate every
 * user in the system. One inbox request now costs zero extra round trips. */
export default function ConversationRow({ conversation, currentUserId }) {
  const other = otherParticipant(conversation, currentUserId);
  const otherName = other?.displayName || "ผู้ใช้";
  // Which side the OTHER person is on in this specific room — lets the
  // inbox be scanned at a glance ("this one's a shop, that one's support")
  // without opening each thread.
  const roleLabel = participantRoleLabel(other?.role);
  const unread = hasUnread(conversation, currentUserId);

  return (
    <li>
      <Link
        href={`/chat/${conversation.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
          {otherName[0] || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p
                className={`truncate text-sm ${unread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}
              >
                {otherName}
              </p>
              {roleLabel && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {roleLabel}
                </span>
              )}
            </div>
            {unread && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-emerald-600"
                role="status"
                aria-label="มีข้อความใหม่"
              />
            )}
          </div>
          <p className="truncate text-xs text-gray-500">
            {conversation.lastMessagePreview || "เริ่มการสนทนา"}
          </p>
        </div>
      </Link>
    </li>
  );
}
