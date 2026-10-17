const { badRequest } = require("@reloop/shared");
const defaultRepository = require("./marketingAuditRepository");
const defaultAuthClient = require("./marketingAuditAuthClient");
const defaultPrisma = require("../../models/prismaClient");

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
  "AUCTION_ROUND_UPDATE",
  "AUCTION_ROUND_CANCEL",
  "AUCTION_ITEM_APPROVE",
  "AUCTION_ITEM_REJECT",
  "AUCTION_ITEM_SCHEDULE",
  "AUCTION_ITEM_CANCEL",
  "AUCTION_ITEM_CLOSE",
  "AUCTION_WINNER_ADVANCE",
  "AUCTION_PAYMENT_EXPIRED_NO_NEXT_BIDDER",
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

function createMarketingAuditService(
  repository = defaultRepository,
  authClient = defaultAuthClient,
  prismaClient = defaultPrisma,
) {
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

  async function enrichActors(items) {
    if (!Array.isArray(items) || items.length === 0) return items;

    const unresolvedIds = [];
    for (const item of items) {
      if (!item.actorId) {
        item.actorName = "-";
        continue;
      }
      if (item.actorId === "SYSTEM") {
        item.actorName = "ระบบอัตโนมัติ";
        item.actorNameSource = "system";
        continue;
      }

      // Check snapshot that explicitly confirms the ACTOR's name
      // NEVER use article authorName or entity owner - the editor is not necessarily the author!
      const snapshotName =
        item.metadata?.actorName ||
        item.metadata?.operatorName ||
        item.metadata?.actorDisplayName ||
        null;

      if (snapshotName) {
        item.actorName = snapshotName;
        item.actorNameSource = "snapshot";
        continue;
      }

      unresolvedIds.push(item.actorId);
    }

    const uniqueIds = [...new Set(unresolvedIds)];
    let nameMap = {};
    if (
      uniqueIds.length > 0 &&
      authClient &&
      typeof authClient.getDisplayNames === "function"
    ) {
      try {
        const resolved = await authClient.getDisplayNames(uniqueIds);
        if (Array.isArray(resolved)) {
          nameMap = Object.fromEntries(
            resolved
              .filter((r) => r && r.userId && r.displayName)
              .map((r) => [r.userId, r.displayName]),
          );
        }
      } catch (err) {
        console.warn("[marketingAuditService] enrichActors error:", err.message);
      }
    }

    for (const item of items) {
      if (!item.actorName) {
        if (nameMap[item.actorId]) {
          item.actorName = nameMap[item.actorId];
          item.isCurrentName = true;
          item.actorNameSource = "auth_directory";
        } else {
          item.actorName = item.actorId;
          item.actorNameSource = "fallback_id";
        }
      }
    }

    return items;
  }

  async function enrichEntities(items) {
    if (!Array.isArray(items) || items.length === 0) return items;

    const missingByType = {
      CAMPAIGN: [],
      ARTICLE: [],
      AUCTION_ROUND: [],
      AUCTION_ITEM: [],
    };

    for (const item of items) {
      if (!item.entityId) {
        item.entityName = "-";
        continue;
      }

      let prevName = null;
      let newName = null;
      let resolvedName = null;

      if (item.entityType === "CAMPAIGN") {
        prevName = item.previousState?.name || item.previousState?.title || null;
        newName = item.newState?.name || item.newState?.title || null;
        resolvedName =
          newName ||
          prevName ||
          item.newState?.code ||
          item.previousState?.code ||
          null;
      } else if (item.entityType === "ARTICLE") {
        prevName = item.previousState?.title || null;
        newName = item.newState?.title || null;
        resolvedName = newName || prevName || null;
      } else if (item.entityType === "AUCTION_ROUND") {
        prevName = item.previousState?.title || item.previousState?.name || null;
        newName = item.newState?.title || item.newState?.name || null;
        resolvedName = newName || prevName || null;
      } else if (item.entityType === "AUCTION_ITEM") {
        prevName =
          item.previousState?.product?.title ||
          item.previousState?.productTitle ||
          item.previousState?.itemTitle ||
          item.previousState?.title ||
          null;
        newName =
          item.newState?.product?.title ||
          item.newState?.productTitle ||
          item.newState?.itemTitle ||
          item.newState?.title ||
          null;
        resolvedName = newName || prevName || null;
      }

      item.previousEntityName = prevName;
      item.newEntityName = newName;

      if (resolvedName) {
        item.entityName = resolvedName;
        item.entityNameSource = "snapshot";
      } else {
        if (missingByType[item.entityType]) {
          missingByType[item.entityType].push(item.entityId);
        }
      }
    }

    const currentNames = {};
    try {
      if (prismaClient) {
        const cIds = [...new Set(missingByType.CAMPAIGN || [])];
        if (
          cIds.length > 0 &&
          prismaClient.campaign &&
          typeof prismaClient.campaign.findMany === "function"
        ) {
          const rows = await prismaClient.campaign.findMany({
            where: { id: { in: cIds } },
            select: { id: true, name: true, code: true },
          });
          rows.forEach((r) => {
            currentNames[`CAMPAIGN:${r.id}`] = r.name || r.code || r.id;
          });
        }

        const aIds = [...new Set(missingByType.ARTICLE || [])];
        if (
          aIds.length > 0 &&
          prismaClient.article &&
          typeof prismaClient.article.findMany === "function"
        ) {
          const rows = await prismaClient.article.findMany({
            where: { id: { in: aIds } },
            select: { id: true, title: true },
          });
          rows.forEach((r) => {
            currentNames[`ARTICLE:${r.id}`] = r.title || r.id;
          });
        }

        const rIds = [...new Set(missingByType.AUCTION_ROUND || [])];
        if (
          rIds.length > 0 &&
          prismaClient.auctionRound &&
          typeof prismaClient.auctionRound.findMany === "function"
        ) {
          const rows = await prismaClient.auctionRound.findMany({
            where: { id: { in: rIds } },
            select: { id: true, title: true },
          });
          rows.forEach((r) => {
            currentNames[`AUCTION_ROUND:${r.id}`] = r.title || r.id;
          });
        }

        const iIds = [...new Set(missingByType.AUCTION_ITEM || [])];
        if (
          iIds.length > 0 &&
          prismaClient.auctionItem &&
          typeof prismaClient.auctionItem.findMany === "function"
        ) {
          const rows = await prismaClient.auctionItem.findMany({
            where: { id: { in: iIds } },
            select: { id: true, product: { select: { title: true } } },
          });
          rows.forEach((r) => {
            currentNames[`AUCTION_ITEM:${r.id}`] = r.product?.title || r.id;
          });
        }
      }
    } catch (err) {
      console.warn(
        "[marketingAuditService] enrichEntities lookup error:",
        err.message,
      );
    }

    for (const item of items) {
      if (!item.entityName) {
        const lookupKey = `${item.entityType}:${item.entityId}`;
        if (currentNames[lookupKey]) {
          item.entityName = currentNames[lookupKey];
          item.isCurrentEntityName = true;
          item.entityNameSource = "current_record";
        } else {
          item.entityName = item.entityId;
          item.entityNameSource = "fallback_id";
        }
      }
    }

    return items;
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

    // Operator search filter: supports query by name, partial name, or User ID
    const actorSearch = (query.actorQuery || query.q || "").trim();
    let matchedActorIds = null;

    if (actorSearch) {
      const candidateIds = [];
      const isSystemQuery =
        actorSearch.toUpperCase() === "SYSTEM" ||
        "ระบบอัตโนมัติ".toLowerCase().includes(actorSearch.toLowerCase()) ||
        "ระบบ".includes(actorSearch.toLowerCase());

      if (isSystemQuery) {
        candidateIds.push("SYSTEM");
      }

      // Search users in auth-service via internal API boundary (never direct DB)
      // Fail-closed: If auth service fails or is unreachable, errors bubble up to return 502
      if (authClient && typeof authClient.searchUsers === "function") {
        const authUsers = await authClient.searchUsers(actorSearch);
        if (Array.isArray(authUsers)) {
          for (const u of authUsers) {
            if (u.id) candidateIds.push(u.id);
            if (u.userId) candidateIds.push(u.userId);
          }
        }
      }

      // Always allow matching actorSearch directly as an exact actorId candidate in Audit records
      // (supports non-UUID IDs, custom IDs, deleted accounts, or legacy IDs)
      candidateIds.push(actorSearch);

      matchedActorIds = [...new Set(candidateIds)];

      // If actor search was provided but yielded 0 matching IDs, return clean empty result
      if (matchedActorIds.length === 0) {
        return {
          items: [],
          data: [],
          page,
          limit,
          total: 0,
          totalPages: 1,
        };
      }
    }

    const { items, total } = await repository.listAuditLogs({
      action: query.action || undefined,
      entityType: query.entityType || undefined,
      entityId: query.entityId || undefined,
      actorId: actorSearch ? undefined : (query.actorId || undefined),
      actorIds: matchedActorIds || undefined,
      actorRole: query.actorRole || undefined,
      fromDate,
      toDate,
      skip,
      take,
    });

    await enrichActors(items);
    await enrichEntities(items);

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

module.exports = createMarketingAuditService(
  defaultRepository,
  defaultAuthClient,
  defaultPrisma,
);
module.exports.createMarketingAuditService = createMarketingAuditService;
