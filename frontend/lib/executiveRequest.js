import { apiFetch } from "./api";

export const EXECUTIVE_REQUEST_TIMEOUT_MS = 15000;

export function executiveFetch(path, options = {}) {
  return apiFetch(path, {
    ...options,
    timeoutMs: EXECUTIVE_REQUEST_TIMEOUT_MS,
  });
}
