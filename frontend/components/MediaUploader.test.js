import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MediaUploader from "./MediaUploader";
import { uploadFiles } from "../lib/api";

jest.mock("../lib/api", () => ({
  uploadFiles: jest.fn(),
  mediaUrl: (url) => url,
}));
beforeEach(() => jest.clearAllMocks());

test("sends the original once for server processing and previews processed output", async () => {
  const file = new File(["photo"], "photo.png", { type: "image/png" });
  const media = [{ url: "/uploads/processed.webp", type: "image" }];
  uploadFiles.mockResolvedValue(media);
  const onChange = jest.fn();
  const { container, rerender } = render(
    <MediaUploader value={[]} onChange={onChange} token="seller" />,
  );
  fireEvent.change(container.querySelector("input"), {
    target: { files: [file] },
  });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(media));
  expect(uploadFiles).toHaveBeenCalledWith([file], "seller");
  rerender(<MediaUploader value={media} onChange={onChange} token="seller" />);
  expect(container.querySelector("img")).toHaveAttribute(
    "src",
    "/uploads/processed.webp",
  );
  expect(screen.getByText(/500 KB/)).toBeInTheDocument();
});

test("reports processing errors without adding the original to the listing", async () => {
  uploadFiles.mockRejectedValueOnce(new Error("ประมวลผลรูปภาพไม่สำเร็จ"));
  const onChange = jest.fn();
  const { container } = render(
    <MediaUploader value={[]} onChange={onChange} token="seller" />,
  );
  fireEvent.change(container.querySelector("input"), {
    target: { files: [new File(["bad"], "bad.png", { type: "image/png" })] },
  });
  expect(
    await screen.findByText("ประมวลผลรูปภาพไม่สำเร็จ"),
  ).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test("normal listing keeps its 20 MB input limit", async () => {
  const file = new File(["photo"], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: 21 * 1024 * 1024 });
  const { container } = render(
    <MediaUploader value={[]} onChange={jest.fn()} token="seller" />,
  );
  fireEvent.change(container.querySelector("input"), {
    target: { files: [file] },
  });
  expect(await screen.findByText(/20 MB: photo.png/)).toBeInTheDocument();
  expect(uploadFiles).not.toHaveBeenCalled();
});
