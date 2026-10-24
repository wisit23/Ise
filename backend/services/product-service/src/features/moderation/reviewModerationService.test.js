const test = require("node:test");
const assert = require("node:assert/strict");
const calls = {};
const prisma = {
  $transaction: async (fn) => fn(prisma),
  $executeRaw: async () => {},
  review: {
    findUnique: async () => calls.review,
    delete: async () => { calls.deleted = true; },
  },
  marketingAuditLog: {
    findUnique: async () => calls.existing,
    create: async ({ data }) => { calls.audit = data; },
  },
};
const prismaPath = require.resolve("../../models/prismaClient");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const { removeReview } = require("./reviewModerationService");
const command = { reason: "confirmed spam", targetId: "buyer-1", productId: "product-1", actorId: "staff-1", idempotencyKey: "review-command-1" };

test("review removal validates the target, keeps evidence and replays without a second delete", async () => {
  calls.review = { id: "review-1", buyerId: "buyer-1", productId: "product-1", comment: "spam", rating: 1, mediaEntries: [{ url: "/evidence.jpg" }] };
  await assert.rejects(removeReview("review-1", { ...command, targetId: "other-buyer" }), (err) => err.status === 409);
  assert.equal(calls.deleted, undefined);
  await assert.rejects(removeReview("review-1", { ...command, productId: "other-product" }), (err) => err.status === 409);
  await assert.rejects(removeReview("review-1", { ...command, reason: " " }), (err) => err.status === 400);
  const result = await removeReview("review-1", command);
  assert.deepEqual(result, { id: "review-1", removed: true });
  assert.equal(calls.deleted, true);
  assert.equal(calls.audit.previousState.comment, "spam");
  assert.equal(calls.audit.previousState.mediaEntries[0].url, "/evidence.jpg");
  calls.existing = calls.audit;
  calls.deleted = false;
  calls.review = null;
  assert.deepEqual(await removeReview("review-1", command), result);
  assert.equal(calls.deleted, false);
  await assert.rejects(removeReview("review-1", { ...command, reason: "different" }), (err) => err.status === 409);
  calls.existing = null;
  await assert.rejects(removeReview("missing-review", command), (err) => err.status === 404);
});
