import { apiFetch } from "./api";

/** Old generated notices may retain a decorative prefix in stored data. */
export function notificationText(value) {
  return String(value || "").replace(/^(?:[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)+/u, "");
}

/**
 * Fetches recent notifications for the current authenticated user.
 */
export async function getNotifications(token, { limit = 30, unreadOnly = false } = {}) {
  const qs = new URLSearchParams();
  if (limit) qs.set("limit", String(limit));
  if (unreadOnly) qs.set("unreadOnly", "true");
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch(`/api/notifications${query}`, { token });
}

/**
 * Gets total unread notification count.
 */
export async function getUnreadNotificationCount(token) {
  return apiFetch("/api/notifications/unread-count", { token });
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationRead(token, notificationId) {
  return apiFetch(`/api/notifications/${notificationId}/read`, {
    method: "PATCH",
    token,
  });
}

/**
 * Marks all notifications as read.
 */
export async function markAllNotificationsRead(token) {
  return apiFetch("/api/notifications/read-all", {
    method: "POST",
    token,
  });
}

/**
 * Deletes a notification by id.
 */
export async function deleteNotification(token, notificationId) {
  return apiFetch(`/api/notifications/${notificationId}`, {
    method: "DELETE",
    token,
  });
}

