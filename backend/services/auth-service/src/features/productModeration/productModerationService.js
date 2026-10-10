const { badRequest } = require("@reloop/shared");
const productModerationClient = require("../../services/productModerationClient");
const reportService = require("../reports/reportService");

async function executeModeration({
  action,
  productId,
  actorId,
  reason,
  idempotencyKey,
  requestId,
}) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (!idempotencyKey) throw badRequest("idempotencyKey is required");

  // Product-service owns moderation idempotency. Auth-service records only the
  // resulting admin audit because the approved ER has no operation table.
  const product =
    action === "REMOVE_PRODUCT"
      ? await productModerationClient.removeProduct(
          productId,
          trimmedReason,
          idempotencyKey,
        )
      : await productModerationClient.restoreProduct(
          productId,
          trimmedReason,
          idempotencyKey,
        );

  await reportService.recordAdminAction({
    actorId,
    action:
      action === "REMOVE_PRODUCT" ? "PRODUCT_REMOVED" : "PRODUCT_RESTORED",
    targetId: productId,
    reason: trimmedReason,
    requestId: requestId || idempotencyKey,
  });
  return product;
}

/**
 * Direct product moderation (ADM-003 extension) — lets Admin remove/restore
 * any listing straight from a product search, not only when a Report
 * happens to reference it. Reuses reportService's audit log so every
 * privileged action lands in the same admin_audits table regardless of
 * which surface (Report inbox vs direct search) triggered it.
 */
async function removeProduct({
  productId,
  adminId,
  staffId,
  reason,
  idempotencyKey,
  requestId,
}) {
  const actorId = staffId || adminId;
  return executeModeration({
    action: "REMOVE_PRODUCT",
    productId,
    actorId,
    reason,
    idempotencyKey,
    requestId,
  });
}

async function restoreProduct({
  productId,
  adminId,
  staffId,
  reason,
  idempotencyKey,
  requestId,
}) {
  const actorId = staffId || adminId;
  return executeModeration({
    action: "RESTORE_PRODUCT",
    productId,
    actorId,
    reason,
    idempotencyKey,
    requestId,
  });
}

module.exports = { removeProduct, restoreProduct };
