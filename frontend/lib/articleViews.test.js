import {
  ARTICLE_VIEW_DWELL_MS,
  getArticleViewSessionId,
  scheduleVisibleArticleDwell,
} from "./articleViews";

describe("article view tracking", () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("keeps one anonymous identity for the current browser session", () => {
    const first = getArticleViewSessionId();
    const second = getArticleViewSessionId();

    expect(first).toEqual(expect.any(String));
    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(second).toBe(first);
  });

  test("completes only after 20 visible seconds", () => {
    const onComplete = jest.fn();
    const cleanup = scheduleVisibleArticleDwell(onComplete);

    jest.advanceTimersByTime(ARTICLE_VIEW_DWELL_MS - 1);
    expect(onComplete).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    cleanup();
  });

  test("cleanup prevents counting after leaving the article", () => {
    const onComplete = jest.fn();
    const cleanup = scheduleVisibleArticleDwell(onComplete);

    jest.advanceTimersByTime(5_000);
    cleanup();
    jest.advanceTimersByTime(ARTICLE_VIEW_DWELL_MS);

    expect(onComplete).not.toHaveBeenCalled();
  });
});
