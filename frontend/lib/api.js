const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function apiFetch(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

/** Uploads files as multipart/form-data. Browser sets the boundary itself, so
 * Content-Type must NOT be set manually here (unlike apiFetch's JSON body). */
export async function uploadFiles(files, token) {
  const form = new FormData();
  for (const file of files) form.append("files", file);

  const res = await fetch(`${API_URL}/uploads`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  return data.media;
}

export function mediaUrl(url) {
  if (!url) return url;
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}
