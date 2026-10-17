const ARTICLE_VIEW_SESSION_KEY = "reloop_article_view_session";
export const ARTICLE_VIEW_DWELL_MS = 20_000;

function createSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getArticleViewSessionId() {
  if (typeof window === "undefined") return null;
  let sessionId = sessionStorage.getItem(ARTICLE_VIEW_SESSION_KEY);
  if (!sessionId) {
    sessionId = createSessionId();
    sessionStorage.setItem(ARTICLE_VIEW_SESSION_KEY, sessionId);
  }
  return sessionId;
}

// Count only time during which the article tab is actually visible. The server
// independently verifies the minimum wall-clock dwell time before accepting it.
export function scheduleVisibleArticleDwell(
  onComplete,
  durationMs = ARTICLE_VIEW_DWELL_MS,
) {
  if (typeof document === "undefined") return () => {};

  let remainingMs = durationMs;
  let visibleSince = null;
  let timer = null;
  let finished = false;

  const clearCurrentTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const pause = () => {
    if (visibleSince !== null) {
      remainingMs = Math.max(0, remainingMs - (Date.now() - visibleSince));
      visibleSince = null;
    }
    clearCurrentTimer();
  };

  const finish = () => {
    if (finished) return;
    pause();
    finished = true;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    onComplete();
  };

  const resume = () => {
    if (finished || document.visibilityState === "hidden") return;
    visibleSince = Date.now();
    timer = setTimeout(finish, remainingMs);
  };

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") pause();
    else resume();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  resume();

  return () => {
    finished = true;
    pause();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
