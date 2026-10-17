const { badRequest, notFound } = require("@reloop/shared");
const {
  articleViewRepository,
} = require("./articleViewRepository");

const ARTICLE_VIEW_DWELL_MS = 20_000;
const GUEST_SESSION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function viewError(message, code) {
  const error = badRequest(message);
  error.code = code;
  return error;
}

function resolveViewer({ userId, guestSessionId }) {
  if (userId) return { userId };
  const cleanSessionId = String(guestSessionId || "").trim();
  if (!GUEST_SESSION_PATTERN.test(cleanSessionId)) {
    throw viewError(
      "ไม่สามารถระบุ Session ของผู้อ่านได้ กรุณารีเฟรชหน้าแล้วลองใหม่",
      "INVALID_ARTICLE_VIEW_SESSION",
    );
  }
  return { guestSessionId: cleanSessionId };
}

function createArticleViewService(
  repository = articleViewRepository,
  now = () => new Date(),
) {
  async function assertPublished(articleId) {
    if (!(await repository.findPublishedArticle(articleId))) {
      throw notFound("ไม่พบบทความที่ต้องการ");
    }
  }

  async function start({ articleId, userId, guestSessionId }) {
    await assertPublished(articleId);
    const identity = resolveViewer({ userId, guestSessionId });
    const existing = await repository.find(articleId, identity);
    if (existing?.countedAt) {
      return {
        alreadyCounted: true,
        viewCount: await repository.count(articleId),
      };
    }

    const startedAt = now();
    await repository.start(articleId, identity, startedAt);
    return {
      alreadyCounted: false,
      dwellMs: ARTICLE_VIEW_DWELL_MS,
      startedAt: startedAt.toISOString(),
    };
  }

  async function complete({ articleId, userId, guestSessionId }) {
    await assertPublished(articleId);
    const identity = resolveViewer({ userId, guestSessionId });
    const view = await repository.find(articleId, identity);
    if (!view) {
      throw viewError(
        "กรุณาเริ่มอ่านบทความก่อนบันทึกยอดอ่าน",
        "ARTICLE_VIEW_NOT_STARTED",
      );
    }

    if (view.countedAt) {
      return {
        counted: false,
        alreadyCounted: true,
        viewCount: await repository.count(articleId),
      };
    }

    const countedAt = now();
    const elapsedMs = countedAt.getTime() - view.startedAt.getTime();
    if (elapsedMs < ARTICLE_VIEW_DWELL_MS) {
      const error = viewError(
        "ต้องอ่านบทความอย่างน้อย 20 วินาทีก่อนบันทึกยอดอ่าน",
        "ARTICLE_VIEW_DWELL_REQUIRED",
      );
      error.remainingMs = ARTICLE_VIEW_DWELL_MS - elapsedMs;
      throw error;
    }

    const result = await repository.markCounted(view.id, countedAt);
    return {
      counted: result.count === 1,
      alreadyCounted: result.count === 0,
      viewCount: await repository.count(articleId),
    };
  }

  return { start, complete };
}

module.exports = {
  ARTICLE_VIEW_DWELL_MS,
  resolveViewer,
  createArticleViewService,
  start: createArticleViewService().start,
  complete: createArticleViewService().complete,
};
