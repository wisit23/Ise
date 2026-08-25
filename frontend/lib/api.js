import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  clearSession,
} from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Access tokens expire after 15 minutes (JWT_ACCESS_EXPIRES). Rather than
// force a re-login every 15 minutes, a 401 triggers one silent refresh (via
// the 7-day refresh token) and the original request is retried once. If the
// refresh itself fails, the session really is dead and we log the user out.
let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

function forceLogout() {
  clearSession();
  if (typeof window !== "undefined") window.location.href = "/login";
}

export async function apiFetch(path, { method = "GET", body, token } = {}) {
  const authToken = token ?? getAccessToken();

  let res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && authToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) forceLogout();
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

/** Uploads files as multipart/form-data. Browser sets the boundary itself, so
 * Content-Type must NOT be set manually here (unlike apiFetch's JSON body). */
export async function uploadFiles(files, token) {
  const authToken = token ?? getAccessToken();

  const form = new FormData();
  for (const file of files) form.append("files", file);

  let res = await fetch(`${API_URL}/uploads`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: form,
  });

  if (res.status === 401 && authToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${newToken}` },
        body: form,
      });
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) forceLogout();
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  return data.media;
}

export function mediaUrl(url) {
  if (!url) return url;
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}
