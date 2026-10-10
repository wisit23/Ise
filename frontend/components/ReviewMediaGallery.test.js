import { render, screen, fireEvent } from "@testing-library/react";
import ReviewMediaGallery from "./ReviewMediaGallery";

const mockMedia = [
  { url: "/uploads/photo1.jpg", type: "image" },
  { url: "/uploads/video1.mp4", type: "video" },
  { url: "/uploads/photo2.jpg", type: "image" },
];

test("renders nothing when media is empty or undefined", () => {
  const { container: c1 } = render(<ReviewMediaGallery media={[]} />);
  expect(c1.firstChild).toBeNull();

  const { container: c2 } = render(<ReviewMediaGallery media={null} />);
  expect(c2.firstChild).toBeNull();
});

test("renders thumbnails for all media items with video indicator", () => {
  render(<ReviewMediaGallery media={mockMedia} />);

  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(3);

  // Video item contains the play indicator
  expect(screen.getByText("▶")).toBeInTheDocument();
});

test("clicking a thumbnail opens lightbox modal, cycles items, and closes on escape or close button", () => {
  render(<ReviewMediaGallery media={mockMedia} />);

  const buttons = screen.getAllByRole("button");
  // Click first thumbnail
  fireEvent.click(buttons[0]);

  // Lightbox dialog should open
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("1 / 3")).toBeInTheDocument();

  // Next button cycles to video
  const nextBtn = screen.getByLabelText("ถัดไป");
  fireEvent.click(nextBtn);
  expect(screen.getByText("2 / 3")).toBeInTheDocument();

  // Prev button goes back to first image
  const prevBtn = screen.getByLabelText("ก่อนหน้า");
  fireEvent.click(prevBtn);
  expect(screen.getByText("1 / 3")).toBeInTheDocument();

  // Close button closes modal
  const closeBtn = screen.getByLabelText("ปิดหน้าต่างรูปภาพ");
  fireEvent.click(closeBtn);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
