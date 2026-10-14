// New on a full page visit/refresh, stable during pagination and retries.
export function createFeedSeed() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
