const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

/** Parses page/limit query params into Prisma skip/take, clamped to sane bounds. */
function parsePagination(query, defaultLimit = DEFAULT_LIMIT) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || defaultLimit),
  );
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

function paginatedResponse(items, total, { page, limit }) {
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

module.exports = { parsePagination, paginatedResponse };
