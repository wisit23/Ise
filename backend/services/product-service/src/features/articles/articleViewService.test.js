const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ARTICLE_VIEW_DWELL_MS,
  createArticleViewService,
  resolveViewer,
} = require("./articleViewService");

function repositoryFixture(existing = null) {
  const calls = [];
  return {
    calls,
    findPublishedArticle: async () => ({ id: "article-1" }),
    find: async () => existing,
    start: async (...args) => calls.push(["start", ...args]),
    markCounted: async (...args) => {
      calls.push(["markCounted", ...args]);
      return { count: 1 };
    },
    count: async () => 7,
  };
}

test("logged-in identity always wins over a supplied guest session", () => {
  assert.deepEqual(
    resolveViewer({ userId: "buyer-1", guestSessionId: "guest-session-123456" }),
    { userId: "buyer-1" },
  );
});

test("guest identity requires a stable, bounded browser session id", () => {
  assert.deepEqual(resolveViewer({ guestSessionId: "guest-session-123456" }), {
    guestSessionId: "guest-session-123456",
  });
  assert.throws(
    () => resolveViewer({ guestSessionId: "short" }),
    (error) => error.code === "INVALID_ARTICLE_VIEW_SESSION",
  );
});

test("start records server time but does not count a read yet", async () => {
  const repository = repositoryFixture();
  const startedAt = new Date("2026-10-17T05:00:00.000Z");
  const service = createArticleViewService(repository, () => startedAt);

  const result = await service.start({
    articleId: "article-1",
    userId: "buyer-1",
  });

  assert.equal(result.alreadyCounted, false);
  assert.equal(result.dwellMs, ARTICLE_VIEW_DWELL_MS);
  assert.deepEqual(repository.calls[0], [
    "start",
    "article-1",
    { userId: "buyer-1" },
    startedAt,
  ]);
});

test("complete rejects attempts before the 20 second dwell threshold", async () => {
  const startedAt = new Date("2026-10-17T05:00:00.000Z");
  const repository = repositoryFixture({
    id: "view-1",
    startedAt,
    countedAt: null,
  });
  const service = createArticleViewService(
    repository,
    () => new Date(startedAt.getTime() + ARTICLE_VIEW_DWELL_MS - 1),
  );

  await assert.rejects(
    () => service.complete({ articleId: "article-1", userId: "buyer-1" }),
    (error) => error.code === "ARTICLE_VIEW_DWELL_REQUIRED",
  );
  assert.equal(repository.calls.length, 0);
});

test("complete counts once after 20 seconds and returns the shared total", async () => {
  const startedAt = new Date("2026-10-17T05:00:00.000Z");
  const countedAt = new Date(startedAt.getTime() + ARTICLE_VIEW_DWELL_MS);
  const repository = repositoryFixture({
    id: "view-1",
    startedAt,
    countedAt: null,
  });
  const service = createArticleViewService(repository, () => countedAt);

  const result = await service.complete({
    articleId: "article-1",
    guestSessionId: "guest-session-123456",
  });

  assert.deepEqual(result, {
    counted: true,
    alreadyCounted: false,
    viewCount: 7,
  });
  assert.deepEqual(repository.calls[0], ["markCounted", "view-1", countedAt]);
});

test("an already-counted reader remains idempotent", async () => {
  const repository = repositoryFixture({
    id: "view-1",
    startedAt: new Date("2026-10-17T05:00:00.000Z"),
    countedAt: new Date("2026-10-17T05:00:20.000Z"),
  });
  const service = createArticleViewService(repository);

  const startResult = await service.start({
    articleId: "article-1",
    userId: "buyer-1",
  });
  const completeResult = await service.complete({
    articleId: "article-1",
    userId: "buyer-1",
  });

  assert.deepEqual(startResult, { alreadyCounted: true, viewCount: 7 });
  assert.deepEqual(completeResult, {
    counted: false,
    alreadyCounted: true,
    viewCount: 7,
  });
  assert.equal(repository.calls.length, 0);
});
