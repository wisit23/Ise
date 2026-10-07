const crypto = require("node:crypto");
const defaultPrisma = require("../../models/prismaClient");
const { sanitizeAuditData } = require("./marketingAuditSanitizer");

/**
 * Repository for Marketing Audit Trail.
 * Layering: route -> controller -> service -> repository -> Prisma PostgreSQL.
 */
function createMarketingAuditRepository(prismaClient = defaultPrisma) {
  /**
   * Persist an append-only audit entry.
   * If tx is provided, runs within that transaction.
   * Handles idempotencyKey collisions (P2002) for retryable/automatic actions by returning existing record
   * without aborting PostgreSQL transaction block (avoids 25P02 error via createMany + skipDuplicates).
   *
   * @param {Object} entry
   * @param {string} entry.actorId
   * @param {string} entry.actorRole
   * @param {string} entry.action
   * @param {string} entry.entityType
   * @param {string} entry.entityId
   * @param {*} [entry.previousState]
   * @param {*} [entry.newState]
   * @param {*} [entry.metadata]
   * @param {string} [entry.idempotencyKey]
   * @param {Object} [options]
   * @param {Object} [options.tx] - Optional Prisma transaction client
   * @returns {Promise<Object>} Created or existing audit log record
   */
  async function recordAudit(
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
    const client = tx || prismaClient;

    const data = {
      actorId: String(actorId),
      actorRole: String(actorRole),
      action: String(action),
      entityType: String(entityType),
      entityId: String(entityId),
      previousState:
        previousState !== null && previousState !== undefined
          ? sanitizeAuditData(previousState)
          : null,
      newState:
        newState !== null && newState !== undefined
          ? sanitizeAuditData(newState)
          : null,
      metadata:
        metadata !== null && metadata !== undefined
          ? sanitizeAuditData(metadata)
          : null,
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
    };

    if (idempotencyKey) {
      // For automatic/retryable actions with idempotencyKey, use createMany with skipDuplicates: true.
      // In PostgreSQL, this issues "INSERT INTO ... ON CONFLICT DO NOTHING" which does NOT abort
      // the surrounding transaction block on duplicate collision (avoiding PostgreSQL 25P02 error).
      await client.marketingAuditLog.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            ...data,
          },
        ],
        skipDuplicates: true,
      });

      return await client.marketingAuditLog.findUnique({
        where: { idempotencyKey: String(idempotencyKey) },
      });
    }

    // For standard audit logs without idempotencyKey, create directly and fail loud.
    // If database insertion fails, error propagates and the surrounding transaction rolls back.
    return await client.marketingAuditLog.create({ data });
  }

  /**
   * List audit logs with filters and pagination.
   */
  async function listAuditLogs(
    {
      action,
      entityType,
      entityId,
      actorId,
      actorRole,
      fromDate,
      toDate,
      skip = 0,
      take = 20,
    } = {},
    { tx } = {},
  ) {
    const client = tx || prismaClient;

    const where = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (actorId) where.actorId = actorId;
    if (actorRole) where.actorRole = actorRole;

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lt = toDate;
    }

    const [items, total] = await Promise.all([
      client.marketingAuditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      client.marketingAuditLog.count({ where }),
    ]);

    return { items, total };
  }

  async function findById(id, { tx } = {}) {
    const client = tx || prismaClient;
    return client.marketingAuditLog.findUnique({ where: { id } });
  }

  return {
    recordAudit,
    listAuditLogs,
    findById,
  };
}

module.exports = createMarketingAuditRepository(defaultPrisma);
module.exports.createMarketingAuditRepository = createMarketingAuditRepository;
