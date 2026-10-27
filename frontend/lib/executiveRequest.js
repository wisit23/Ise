import { apiFetch } from "./api";

import { EXECUTIVE_REQUEST_TIMEOUT_MS } from "./executiveConfig";
export { EXECUTIVE_REQUEST_TIMEOUT_MS } from "./executiveConfig";

export function executiveFetch(path, options = {}) {
  return apiFetch(path, {
    ...options,
    timeoutMs: EXECUTIVE_REQUEST_TIMEOUT_MS,
  });
}
