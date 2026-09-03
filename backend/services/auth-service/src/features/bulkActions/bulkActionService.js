const { badRequest, forbidden } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { getAction } = require("./actionRegistry");

const MAX_BATCH_SIZE = 100;

async function executeBatch({
  action,
  ids,
  reason,
  dryRun,
  idempotencyKey,
  adminId,
  permissions,
}) {
  const handler = getAction(action);
  if (!handler) throw badRequest(`unsupported action: ${action}`);
  if (!permissions?.includes(handler.permission)) {
    throw forbidden(`missing permission for action ${action}`);
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    throw badRequest("ids must be a non-empty array");
  }
  if (ids.length > MAX_BATCH_SIZE) {
    throw badRequest(`batch exceeds ${MAX_BATCH_SIZE} items`);
  }
  if (!reason) throw badRequest("reason is required");

  // A retried call with the same key returns the original outcome instead of
  // running the batch twice (e.g. a client that times out and retries).
  if (idempotencyKey) {
    const existing = await prisma.bulkActionRun.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing.results;
  }

  const results = [];
  for (const id of ids) {
    if (dryRun) {
      const preview = await handler.preview({ id, adminId });
      results.push({ id, ...preview });
      continue;
    }
    // One id failing must not abort the rest of the batch — each item gets
    // its own outcome (plan.md Step 4: "partial failure").
    try {
      await handler.execute({ id, reason, adminId });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, reason: err.message });
    }
  }

  const summary = {
    action,
    dryRun: !!dryRun,
    total: ids.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };

  if (idempotencyKey && !dryRun) {
    await prisma.bulkActionRun.create({
      data: {
        idempotencyKey,
        actorId: adminId,
        action,
        reason,
        requestedIds: ids,
        results: summary,
      },
    });
  }

  return summary;
}

module.exports = { executeBatch, MAX_BATCH_SIZE };
