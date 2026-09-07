import { render, screen, fireEvent } from "@testing-library/react";
import ReviewMediaUploader from "./ReviewMediaUploader";

jest.mock("../lib/api", () => ({
  uploadReviewFiles: jest.fn(),
  mediaUrl: (url) => url,
}));

test("renders attach button and shows file upload limits", () => {
  render(<ReviewMediaUploader value={[]} onChange={jest.fn()} />);

  expect(
    screen.getByRole("button", { name: /แนบรูปภาพหรือวิดีโอ/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/\(สูงสุด 5 ไฟล์, ขนาดไม่เกิน 20MB ต่อไฟล์\)/),
  ).toBeInTheDocument();
});

test("displays thumbnails and calls onChange when item is removed", () => {
  const onChange = jest.fn();
  const value = [
    { url: "/review-uploads/img1.jpg", type: "image" },
    { url: "/review-uploads/vid1.mp4", type: "video" },
  ];

  render(<ReviewMediaUploader value={value} onChange={onChange} />);

  const deleteButtons = screen.getAllByRole("button", { name: "ลบไฟล์นี้" });
  expect(deleteButtons).toHaveLength(2);

  fireEvent.click(deleteButtons[0]);
  expect(onChange).toHaveBeenCalledWith([
    { url: "/review-uploads/vid1.mp4", type: "video" },
  ]);
});
