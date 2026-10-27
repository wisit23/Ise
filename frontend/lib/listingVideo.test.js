import { validateListingVideo, MAX_VIDEO_BYTES } from "./listingVideo";

let metadata;
let failRead;
beforeEach(() => {
  metadata = { duration: 60, videoWidth: 1080, videoHeight: 1080 };
  failRead = false;
  URL.createObjectURL = jest.fn(() => "blob:clip");
  URL.revokeObjectURL = jest.fn();
  const create = document.createElement.bind(document);
  jest.spyOn(document, "createElement").mockImplementation((tag) => {
    if (tag !== "video") return create(tag);
    return {
      ...metadata,
      removeAttribute: jest.fn(),
      set src(value) {
        queueMicrotask(() =>
          failRead ? this.onerror() : this.onloadedmetadata(),
        );
      },
    };
  });
});
afterEach(() => jest.restoreAllMocks());
const clip = (size = 100) => ({ name: "clip.mp4", type: "video/mp4", size });

test("accepts exact limits and releases the preview URL", async () => {
  await expect(
    validateListingVideo(clip(MAX_VIDEO_BYTES)),
  ).resolves.toBeUndefined();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip");
});
test("rejects clips over 100 MB before reading metadata", async () => {
  await expect(validateListingVideo(clip(MAX_VIDEO_BYTES + 1))).rejects.toThrow(
    "100 MB",
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test.each([
  [{ duration: 60.01 }, "60 วินาที"],
  [{ videoWidth: 1920 }, "1080"],
  [{ videoHeight: 1920 }, "1080"],
  [{ duration: Infinity }, "อ่าน"],
])("rejects invalid metadata %j", async (changes, message) => {
  Object.assign(metadata, changes);
  await expect(validateListingVideo(clip())).rejects.toThrow(message);
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
test("rejects unreadable clips", async () => {
  failRead = true;
  await expect(validateListingVideo(clip())).rejects.toThrow("MP4");
});
