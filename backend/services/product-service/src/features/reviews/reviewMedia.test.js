const test = require("node:test");
const assert = require("node:assert/strict");
const { toApiShape, mediaToNestedCreate } = require("./models/reviewModel");

test("mediaToNestedCreate splits media into photos and videos with positions", () => {
  const media = [
    { url: "/uploads/img1.jpg", type: "image" },
    { url: "/uploads/vid1.mp4", type: "video" },
    { url: "/uploads/img2.png", type: "image" },
  ];
  const nested = mediaToNestedCreate(media);
  assert.deepEqual(nested, {
    photos: {
      create: [
        { url: "/uploads/img1.jpg", position: 0 },
        { url: "/uploads/img2.png", position: 2 },
      ],
    },
    videos: {
      create: [{ url: "/uploads/vid1.mp4", position: 1 }],
    },
  });
});

test("mediaToNestedCreate handles empty or null media", () => {
  assert.deepEqual(mediaToNestedCreate([]), {});
  assert.deepEqual(mediaToNestedCreate(null), {});
});

test("toApiShape sorts and combines photos and videos into unified media array", () => {
  const review = {
    id: "r1",
    rating: 5,
    comment: "nice",
    photos: [
      { url: "/uploads/img2.jpg", position: 2 },
      { url: "/uploads/img1.jpg", position: 0 },
    ],
    videos: [{ url: "/uploads/vid1.mp4", position: 1 }],
  };
  const result = toApiShape(review);
  assert.deepEqual(result.media, [
    { url: "/uploads/img1.jpg", type: "image" },
    { url: "/uploads/vid1.mp4", type: "video" },
    { url: "/uploads/img2.jpg", type: "image" },
  ]);
  assert.equal(result.photos, undefined);
  assert.equal(result.videos, undefined);
});

test("toApiShape handles null or reviews without photos/videos", () => {
  assert.equal(toApiShape(null), null);
  const emptyReview = { id: "r2", rating: 4 };
  assert.deepEqual(toApiShape(emptyReview), {
    id: "r2",
    rating: 4,
    media: [],
  });
});
