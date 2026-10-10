const { badRequest } = require("@reloop/shared");
const defaultRepository = require("./marketingAuditRepository");

const VALID_ACTIONS = new Set([
  // Campaign actions
  "CAMPAIGN_CREATE",
  "CAMPAIGN_UPDATE",
  "CAMPAIGN_SUBMIT",
  "CAMPAIGN_APPROVE",
  "CAMPAIGN_REJECT",
  "CAMPAIGN_PUBLISH",
  "CAMPAIGN_END",
  // Auction actions
  "AUCTION_ROUND_CREATE",
  "AUCTION_ROUND_CANCEL",
  "AUCTION_ITEM_APPROVE",
  "AUCTION_ITEM_REJECT",
  "AUCTION_ITEM_SCHEDULE",
  "AUCTION_ITEM_CANCEL",
  "AUCTION_ITEM_CLOSE",
  // Article actions
  "ARTICLE_CREATE",
  "ARTICLE_UPDATE",
  "ARTICLE_PUBLISH",
  "ARTICLE_ARCHIVE",
  "ARTICLE_DELETE",
]);

const VALID_ENTITY_TYPES = new Set([
  "CAMPAIGN",
  "AUCTION_ROUND",
  "AUCTION_ITEM",
  "ARTICLE",
]);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseDateBoundary(dateStr, isEndDate = false) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    if (!isEndDate) {
      return new Date(`${dateStr}T00:00:00+07:00`);
    }
    const [year, month, day] = dateStr.split("-").map(Number);
    const nextDate = new Date(Date.UTC(year, month - 1, day));
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextY = nextDate.getUTCFullYear();
    const nextM = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
    const nextD = String(nextDate.getUTCDate()).padStart(2, "0");
    return new Date(`${nextY}-${nextM}-${nextD}T00:00:00+07:00`);
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "INVALID";
  return d;
}

function createMarketingAuditService(repository = defaultRepository) {
  /**
   * Internal service method to record an audit log.
   * Never exposed directly to client write API.
   */
  async function recordMarketingAudit(
    {
      actorId,
      actorRole,
      action,
      entityType,
      entityId,
      previousState = null,
      newState = null,
      metadata = null,
      idempotencyKey = null,
    },
    { tx } = {},
  ) {
    if (!actorId) throw badRequest("actorId is required for audit log");
    if (!actorRole) throw badRequest("actorRole is required for audit log");
    if (!action) throw badRequest("action is required for audit log");
    if (!VALID_ACTIONS.has(action)) {
      throw badRequest(`invalid audit action: "${action}"`);
    }
    if (!entityType) throw badRequest("entityType is required for audit log");
    if (!VALID_ENTITY_TYPES.has(entityType)) {
      throw badRequest(`invalid audit entityType: "${entityType}"`);
    }
    if (!entityId) throw badRequest("entityId is required for audit log");

    return repository.recordAudit(
      {
        actorId,
        actorRole,
        action,
        entityType,
        entityId,
        previousState,
        newState,
        metadata,
        idempotencyKey,
      },
      { tx },
    );
  }

  /**
   * Query audit logs with pagination and filtering for Marketing.
   */
  async function getAuditLogs(query = {}) {
    const rawPage = parseInt(query.page, 10);
    const page = !Number.isNaN(rawPage) && rawPage > 0 ? rawPage : 1;

    const rawLimit = parseInt(query.limit, 10);
    const limit =
      !Number.isNaN(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_LIMIT)
        : DEFAULT_LIMIT;

    const skip = (page - 1) * limit;
    const take = limit;

    let fromDate = null;
    let toDate = null;

    if (query.from) {
      fromDate = parseDateBoundary(query.from, false);
      if (fromDate === "INVALID" || !fromDate) {
        throw badRequest("invalid 'from' date format");
      }
    }

    if (query.to) {
      toDate = parseDateBoundary(query.to, true);
      if (toDate === "INVALID" || !toDate) {
        throw badRequest("invalid 'to' date format");
      }
    }

    if (fromDate && toDate && fromDate >= toDate) {
      throw badRequest("'from' date must be before 'to' date");
    }

    if (query.action && !VALID_ACTIONS.has(query.action)) {
      throw badRequest(`invalid action filter: "${query.action}"`);
    }

    if (query.entityType && !VALID_ENTITY_TYPES.has(query.entityType)) {
      throw badRequest(`invalid entityType filter: "${query.entityType}"`);
    }

    const { items, total } = await repository.listAuditLogs({
      action: query.action || undefined,
      entityType: query.entityType || undefined,
      entityId: query.entityId || undefined,
      actorId: query.actorId || undefined,
      actorRole: query.actorRole || undefined,
      fromDate,
      toDate,
      skip,
      take,
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items,
      data: items, // Convenience alias matching system conventions
      page,
      limit,
      total,
      totalPages,
    };
  }

  return {
    recordMarketingAudit,
    getAuditLogs,
    parseDateBoundary,
    VALID_ACTIONS,
    VALID_ENTITY_TYPES,
    DEFAULT_LIMIT,
    MAX_LIMIT,
  };
}

module.exports = createMarketingAuditService(defaultRepository);
module.exports.createMarketingAuditService = createMarketingAuditService;
