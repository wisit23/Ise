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
async function removeProduct({ productId, adminId, reason, requestId }) {
  if (!reason) throw badRequest("reason is required");
  const product = await productModerationClient.removeProduct(
    productId,
    reason,
  );
  await reportService.recordAdminAction({
    actorId: adminId,
    action: "PRODUCT_REMOVED",
    targetId: productId,
    reason,
    requestId,
  });
  return product;
}

async function restoreProduct({ productId, adminId, requestId }) {
  const product = await productModerationClient.restoreProduct(productId);
  await reportService.recordAdminAction({
    actorId: adminId,
    action: "PRODUCT_RESTORED",
    targetId: productId,
    reason: "restored via direct product moderation",
    requestId,
  });
  return product;
}

module.exports = { removeProduct, restoreProduct };
