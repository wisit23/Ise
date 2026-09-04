import { io } from "socket.io-client";
import { apiFetch } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** Mirrors chat-service's MAX_MESSAGE_LENGTH (backend/services/chat-service/
 * src/limits.js), which is the ACTUAL gate — this copy only drives the
 * composer's counter and its `maxLength`. Client-side limits stop honest
 * typos, never a crafted request, so the two are allowed to be separate
 * constants: if this one ever drifts low the user is merely stopped early,
 * and if it drifts high the server still refuses with a readable message. */
export const MAX_MESSAGE_LENGTH = 4000;

/** create-or-open — server resolves sellerId itself from productId, this
 * never sends sellerId (see backend chat-service's conversationService.js:
 * a client-supplied sellerId would simply be ignored, but not sending it at
 * all keeps that contract obvious from the call site too). */
export function contactSeller(productId, token) {
  return apiFetch("/api/chat/conversations", {
    method: "POST",
    token,
    body: { contextType: "PRODUCT", productId },
  });
}

export function listConversations(token) {
  return apiFetch("/api/chat/conversations", { token });
}

export function getConversation(conversationId, token) {
  return apiFetch(`/api/chat/conversations/${conversationId}`, { token });
}

/** Newest-first, per the backend contract — callers that render
 * oldest-to-newest (a normal chat log) must reverse `items` themselves. */
export function listMessages(conversationId, { before, limit } = {}, token) {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiFetch(
    `/api/chat/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
    { token },
  );
}

export function sendMessage(conversationId, body, token) {
  return apiFetch(`/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    token,
    body: { body },
  });
}

/** The authed URL an attachment's bytes are served from. Not stored in the
 * message payload because it's fully derivable from ids the client already
 * has — and it must be fetched WITH a bearer token (see fetchAuthedBlobUrl),
 * never used as a bare <img src>, because chat attachments are private. */
export function attachmentUrl(conversationId, messageId) {
  return `/api/chat/conversations/${conversationId}/attachments/${messageId}`;
}

export function markRead(conversationId, token) {
  return apiFetch(`/api/chat/conversations/${conversationId}/read`, {
    method: "POST",
    token,
  });
}

export function getUnreadCount(token) {
  return apiFetch("/api/chat/unread-count", { token });
}

/** True if `conversation` has a message the current user hasn't read yet —
 * computed from the embedded participant list (Conversation.participants),
 * not a separate call, since the inbox already has this data. */
export function hasUnread(conversation, currentUserId) {
  if (!conversation.lastMessageAt) return false;
  const self = conversation.participants.find(
    (p) => p.userId === currentUserId,
  );
  if (!self) return false;
  if (!self.lastReadAt) return true;
  return new Date(conversation.lastMessageAt) > new Date(self.lastReadAt);
}

export function otherParticipant(conversation, currentUserId) {
  return conversation.participants.find((p) => p.userId !== currentUserId);
}

/** The Thai label for a participant's role IN THIS ROOM.
 *
 * Note this reads `Participant.role` — chat-service's own per-conversation
 * field, set when the room was opened — NOT the user's account-level role.
 * The two are deliberately different things: the same person can be the
 * seller in one room and the buyer in another, which an account-level role
 * can't express. Nothing is authorized on this value; it is purely a label.
 *
 * Returns null for an unrecognised role so a future role added elsewhere
 * shows no badge at all rather than leaking a raw enum like "MODERATOR"
 * into the UI.
 */
const ROLE_LABELS = {
  BUYER: "ผู้ซื้อ",
  SELLER: "ร้านค้า",
  AGENT: "ฝ่ายบริการลูกค้า",
  ADMIN: "ผู้ดูแลระบบ",
  SYSTEM: "ระบบ",
};

export function participantRoleLabel(role) {
  return ROLE_LABELS[role] || null;
}

/** One connection per chat room page — created fresh per call, not a shared
 * singleton, since a room page's mount/unmount lifetime already matches the
 * connection's needed lifetime.
 *
 * `path` must match chat-service's own Socket.IO mount point exactly
 * ("/api/chat/socket.io" — see backend's socketServer.js's comment on why
 * it isn't the library default) because the gateway proxies WebSocket
 * upgrades by literal URL prefix, not through Express route stripping like
 * the REST endpoints (see backend/gateway/src/server.js).
 *
 * `reconnection: true` (the default) is intentional here, unlike test
 * scripts that disable it — a dropped connection should recover on its own;
 * the caller (ChatRoomPage) treats "not currently connected" as "fall back
 * to REST polling" rather than tearing anything down. */
export function connectSocket(token) {
  return io(API_URL, {
    path: "/api/chat/socket.io",
    transports: ["websocket"],
    auth: { token },
  });
}
