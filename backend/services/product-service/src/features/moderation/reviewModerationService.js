const { createHash } = require("node:crypto");
const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

// Preserve the review as audit evidence before deleting its public row/media.
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
    await tx.review.delete({ where: { id: reviewId } });
    return result;
  });
}

module.exports = { removeReview };
