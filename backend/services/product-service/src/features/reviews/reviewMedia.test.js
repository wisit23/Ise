const test = require("node:test");
const assert = require("node:assert/strict");
const { toApiShape, mediaToNestedCreate } = require("./models/reviewModel");

test("mediaToNestedCreate writes unified review media with types and positions", () => {
  const media = [
    { url: "/uploads/img1.jpg", type: "image" },
    { url: "/uploads/vid1.mp4", type: "video" },
    { url: "/uploads/img2.png", type: "image" },
  ];
  const nested = mediaToNestedCreate(media);
  assert.deepEqual(nested, {
    mediaEntries: {
      create: [
        { url: "/uploads/img1.jpg", position: 0, mediaType: "IMAGE" },
        { url: "/uploads/vid1.mp4", position: 1, mediaType: "VIDEO" },
        { url: "/uploads/img2.png", position: 2, mediaType: "IMAGE" },
      ],
    },
  });
});

test("mediaToNestedCreate handles empty or null media", () => {
  assert.deepEqual(mediaToNestedCreate([]), {});
  assert.deepEqual(mediaToNestedCreate(null), {});
});

test("toApiShape preserves the public media array over the unified ER table", () => {
  const review = {
    id: "r1",
    rating: 5,
    comment: "nice",
    mediaEntries: [
      { id: "m2", url: "/uploads/img2.jpg", position: 2, mediaType: "IMAGE" },
      { id: "m1", url: "/uploads/img1.jpg", position: 0, mediaType: "IMAGE" },
      { id: "m3", url: "/uploads/vid1.mp4", position: 1, mediaType: "VIDEO" },
    ],
  };
  const result = toApiShape(review);
  assert.deepEqual(result.media, [
    { url: "/uploads/img1.jpg", type: "image" },
    { url: "/uploads/vid1.mp4", type: "video" },
    { url: "/uploads/img2.jpg", type: "image" },
  ]);
  assert.equal(result.mediaEntries, undefined);
  assert.equal(result.rating, 5);
  assert.equal(result.comment, "nice");
});

test("toApiShape handles null or reviews without media", () => {
  assert.equal(toApiShape(null), null);
  const emptyReview = { id: "r2", rating: 4 };
  assert.deepEqual(toApiShape(emptyReview), {
    id: "r2",
    rating: 4,
    media: [],
  });
});
