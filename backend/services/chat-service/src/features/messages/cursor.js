// Pure helpers for cursor-based message pagination. Deliberately NOT
// page/limit offset pagination (unlike shared/pagination.js, used elsewhere
// in the repo) — a chat conversation gets new messages inserted at the top
// constantly, and offset pagination shifts under concurrent inserts (page 2
// can silently re-show or skip rows once page 1 has grown). Cursoring on the
// last-seen message id sidesteps that entirely.
//
// MongoDB ObjectIds are lexicographically sortable in a way that tracks
// creation order (their first 4 bytes are a Unix timestamp), so filtering
// `id < cursor` with `orderBy: id desc` walks backward through history
// correctly without needing a separate createdAt comparison.
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function isValidCursor(cursor) {
  return typeof cursor === "string" && OBJECT_ID_RE.test(cursor);
}

/** Builds the Prisma findMany args for one page. `before`, if given, must
 * already be validated with isValidCursor — an invalid cursor is a 400 at
 * the controller, not silently ignored here. */
function buildPageQuery({ conversationId, before, limit }) {
  return {
    where: {
      conversationId,
      deletedAt: null,
      ...(before ? { id: { lt: before } } : {}),
    },
    orderBy: { id: "desc" },
    // Fetch one extra row so we can tell whether there's a next page
    // without a separate count() query.
    take: limit + 1,
  };
}

/** Slices the fetched rows down to `limit` and derives `nextCursor` from
 * whichever row is the extra "did we overflow" probe, dropped so callers
 * never leak it into their response. */
function paginate(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  return { items, nextCursor };
}

module.exports = { isValidCursor, buildPageQuery, paginate };
