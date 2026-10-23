const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../../models/prismaClient");
const reviews = require("./reviewModel");

for (const media of [
  [],
  [{ url: "/review-uploads/video.mp4", type: "video" }, { url: "/review-uploads/photo.jpg", type: "image" }],
]) {
  test(`review edit replaces ${media.length} media entries in one owner-scoped nested write`, async (t) => {
    const original = prisma.review.update;
    t.after(() => { prisma.review.update = original; });
    const update = t.mock.fn(async ({ data }) => ({
      id: "review", orderId: "order", buyerId: "buyer", rating: data.rating, comment: data.comment,
      mediaEntries: data.mediaEntries.create.map((m, i) => ({ id: String(i), ...m })),
    }));
    prisma.review.update = update;
    const result = await reviews.update("review", "buyer", { rating: 3, comment: "แก้ไข", media });
    assert.equal(result.id, "review");
    assert.deepEqual(result.media, media);
    assert.equal(update.mock.callCount(), 1);
    const [args] = update.mock.calls[0].arguments;
    assert.deepEqual(args.where, { id: "review", buyerId: "buyer" });
    assert.deepEqual(args.data.mediaEntries.deleteMany, {});
    assert.deepEqual(args.data.mediaEntries.create, media.map((m, position) => ({
      url: m.url, position, mediaType: m.type === "video" ? "VIDEO" : "IMAGE",
    })));
    assert.equal(args.data.orderId, undefined);
    assert.equal(args.data.buyerId, undefined);
    assert.equal(args.data.sellerId, undefined);
  });
}

test("review lookup returns existing ordered media to the edit controller", async (t) => {
  const original = prisma.review.findUnique;
  t.after(() => { prisma.review.findUnique = original; });
  prisma.review.findUnique = async ({ where }) => {
    assert.deepEqual(where, { id: "review" });
    return { id: "review", mediaEntries: [{ id: "m", position: 0, mediaType: "VIDEO", url: "/review-uploads/a.mp4" }] };
  };
  assert.deepEqual((await reviews.findById("review")).media, [{ url: "/review-uploads/a.mp4", type: "video" }]);
});
