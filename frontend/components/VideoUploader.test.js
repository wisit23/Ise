import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VideoUploader from "./VideoUploader";
import { uploadProductClip } from "../lib/api";
import { validateListingVideo } from "../lib/listingVideo";

jest.mock("../lib/listingVideo", () => ({
  validateListingVideo: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/api", () => ({
  uploadProductClip: jest.fn(),
  mediaUrl: (url) => url,
}));

test("uploads swipe clips through the product-video endpoint helper", async () => {
  const onChange = jest.fn();
  const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
  uploadProductClip.mockResolvedValue({
    url: "/uploads/saved-clip.mp4",
    type: "video",
  });

  const { container } = render(
    <VideoUploader value="" onChange={onChange} token="seller-token" />,
  );

  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: { files: [file] },
  });

  await waitFor(() => {
    expect(uploadProductClip).toHaveBeenCalledWith(file, "seller-token");
    expect(onChange).toHaveBeenCalledWith("/uploads/saved-clip.mp4");
  });
});

test("renders the persisted clip URL returned by product-service", () => {
  render(
    <VideoUploader
      value="/uploads/saved-clip.mp4"
      onChange={jest.fn()}
      token="seller-token"
    />,
  );

  expect(screen.getByLabelText("ลบวิดีโอนี้")).toBeInTheDocument();
  expect(document.querySelector("video")).toHaveAttribute(
    "src",
    "/uploads/saved-clip.mp4",
  );
});

test("does not upload a clip that fails validation", async () => {
  uploadProductClip.mockClear();
  validateListingVideo.mockRejectedValueOnce(
    new Error("คลิปต้องยาวไม่เกิน 60 วินาที"),
  );
  const onChange = jest.fn();
  const { container } = render(
    <VideoUploader value="" onChange={onChange} token="seller-token" />,
  );
  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: { files: [new File(["video"], "long.mp4", { type: "video/mp4" })] },
  });
  expect(
    await screen.findByText("คลิปต้องยาวไม่เกิน 60 วินาที"),
  ).toBeInTheDocument();
  expect(uploadProductClip).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});
