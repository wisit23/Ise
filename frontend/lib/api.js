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
// refresh rejects the session, log out; keep it during temporary Auth outages.
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
    const data = await res.json();
    rejectSuspended(data);
    if (res.status >= 500) {
      throw Object.assign(
        new Error(data?.error || "ไม่สามารถตรวจสอบสถานะบัญชีได้ กรุณาลองใหม่"),
        { transient: true },
      );
    }
    if (!res.ok) return null;
    setAccessToken(data.accessToken);
    return data.accessToken;
  } catch (error) {
    // A temporary Auth/network failure is not proof that this session died.
    if (error.code === "ACCOUNT_SUSPENDED" || error.transient) throw error;
    throw new Error("ไม่สามารถตรวจสอบสถานะบัญชีได้ กรุณาลองใหม่");
  }
}

function forceLogout(reason) {
  clearSession();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href =
      reason === "suspended" ? "/login?reason=suspended" : "/login";
  }
}

function rejectSuspended(data) {
  if (data?.code !== "ACCOUNT_SUSPENDED") return;
  forceLogout("suspended");
  throw Object.assign(new Error(data.error || "บัญชีนี้ถูกระงับการใช้งาน"), {
    code: data.code,
  });
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
  rejectSuspended(data);
  if (!res.ok) {
    if (res.status === 401) forceLogout();
    let errorMsg = data?.error;
    if (typeof errorMsg === "object" && errorMsg !== null) {
      errorMsg = errorMsg.message || JSON.stringify(errorMsg);
    }
    throw new Error(errorMsg || `Request failed (${res.status})`);
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
  rejectSuspended(data);
  if (!res.ok) {
    if (res.status === 401) forceLogout();
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  return data.media;
}

/** Uploads one file as dispute evidence — a separate, private endpoint from
 * uploadFiles()'s public /uploads (see order-service's evidenceStorage.js
 * and gateway's PUBLIC_PATHS: this path is deliberately NOT in it). */
export async function uploadDisputeEvidence(disputeId, file, token) {
  const authToken = token ?? getAccessToken();
  const path = `/api/orders/disputes/${disputeId}/evidence`;
  const form = new FormData();
  form.append("file", file);

  let res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: form,
  });

  if (res.status === 401 && authToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${newToken}` },
        body: form,
      });
    }
  }

  const data = await res.json().catch(() => null);
  rejectSuspended(data);
  if (!res.ok) {
    if (res.status === 401) forceLogout();
    throw new Error(data?.error || `Evidence upload failed (${res.status})`);
  }
  return data;
}

/** Submits a seller verification (KYC) application — multipart, same
 * private-storage pattern as uploadDisputeEvidence, since an ID card photo
 * is PII and must never land in product-service's public uploads/. */
export async function submitKyc(fields, documentFile, token) {
  const authToken = token ?? getAccessToken();
  const path = "/api/auth/kyc";
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, value);
  }
  form.append("document", documentFile);

  let res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: form,
  });

  if (res.status === 401 && authToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${newToken}` },
        body: form,
      });
    }
  }

  const data = await res.json().catch(() => null);
  rejectSuspended(data);
  if (!res.ok) {
    if (res.status === 401) forceLogout();
    let errorMsg = data?.error;
    if (typeof errorMsg === "object" && errorMsg !== null) {
      errorMsg = errorMsg.message || JSON.stringify(errorMsg);
    }
    throw new Error(errorMsg || `KYC submission failed (${res.status})`);
  }
  return data;
}

/** Fetches a private, authenticated file (dispute evidence — never a plain
 * <img src>/<a href>, since the browser won't attach a Bearer header to a
 * bare navigation) and returns an object URL. Caller must revokeObjectURL
 * when done with it (e.g. on unmount) to avoid leaking memory. */
export async function fetchAuthedBlobUrl(path, token) {
  const authToken = token ?? getAccessToken();
  let res = await fetch(`${API_URL}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });

  if (res.status === 401 && authToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${API_URL}${path}`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    rejectSuspended(data);
    if (res.status === 401) forceLogout();
    throw new Error(`Request failed (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function mediaUrl(url) {
  if (!url) return url;
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}
