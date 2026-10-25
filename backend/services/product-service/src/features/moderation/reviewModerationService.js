const { createHash } = require("node:crypto");
const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

// Soft delete: the row stays (removed_at + removal_reason) so the review
// drops out of every public list and seller score, and the full snapshot
// is also kept in the audit log as evidence.
async function removeReview(reviewId, { reason, targetId, productId, actorId, idempotencyKey }) {
  if (!reason?.trim() || !targetId || !actorId || !idempotencyKey) {
    throw badRequest("reason, targetId, actorId and idempotency key are required");
  }
  const payloadHash = createHash("sha256").update(JSON.stringify({
    reviewId, reason: reason.trim(), targetId, productId: productId || null, actorId,
  })).digest("hex");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;
    const existing = await tx.marketingAuditLog.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.action !== "REMOVE_REVIEW" || existing.metadata?.payloadHash !== payloadHash) {
        throw conflict("idempotency key was already used with a different command");
      }
      return existing.newState;
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"review:" + reviewId}))`;
    const review = await tx.review.findUnique({ where: { id: reviewId }, include: { mediaEntries: true } });
    if (!review) throw notFound("review not found");
    if (review.buyerId !== targetId || (productId && review.productId !== productId)) {
      throw conflict("review does not match the reported user or product");
    }
    const result = { id: reviewId, removed: true };
    await tx.marketingAuditLog.create({ data: {
      idempotencyKey, action: "REMOVE_REVIEW", entityType: "REVIEW_MODERATION", entityId: reviewId,
      actorId, actorRole: "TRUST_AND_SAFETY",
      previousState: JSON.parse(JSON.stringify(review)), newState: result,
      metadata: { payloadHash, reason: reason.trim() },
    } });
    if (!review.removedAt) {
      await tx.review.update({
        where: { id: reviewId },
        data: { removedAt: new Date(), removalReason: reason.trim() },
      });
    }
    return result;
  });
}

module.exports = { removeReview };
