const test = require("node:test");
const assert = require("node:assert/strict");
const { toApiShape } = require("./reviewModel");

test("a moderated review keeps its identity but hides public comment and media", () => {
  const review = toApiShape({
    id: "review-1", rating: 1, comment: "ข้อมูลที่ต้องซ่อน",
    removedAt: new Date(), removalReason: "ละเมิดกฎ",
    mediaEntries: [{ id: "media-1", position: 0, mediaType: "IMAGE", url: "/review-uploads/a.jpg" }],
  });
  assert.equal(review.id, "review-1");
  assert.equal(review.removed, true);
  assert.equal(review.comment, "");
  assert.deepEqual(review.media, []);
});
