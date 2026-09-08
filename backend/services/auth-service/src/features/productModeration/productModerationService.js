const { badRequest } = require("@reloop/shared");
const productModerationClient = require("../../services/productModerationClient");
const reportService = require("../reports/reportService");

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
  requestId,
}) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  const product = await productModerationClient.removeProduct(
    productId,
    trimmedReason,
  );
  await reportService.recordAdminAction({
    actorId,
    action: "PRODUCT_REMOVED",
    targetId: productId,
    reason: trimmedReason,
    requestId,
  });
  return product;
}

async function restoreProduct({ productId, adminId, staffId, requestId }) {
  const actorId = staffId || adminId;
  const product = await productModerationClient.restoreProduct(productId);
  await reportService.recordAdminAction({
    actorId,
    action: "PRODUCT_RESTORED",
    targetId: productId,
    reason: "restored via direct product moderation",
    requestId,
  });
  return product;
}

module.exports = { removeProduct, restoreProduct };
