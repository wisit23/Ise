import { render, screen, fireEvent } from "@testing-library/react";
import UploadProgressPill from "./UploadProgressPill";

describe("UploadProgressPill", () => {
  it("renders the percentage and progress bar correctly", () => {
    render(<UploadProgressPill progress={27} />);

    expect(screen.getByText("27%")).toBeInTheDocument();
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "27");
  });

  it("handles pause and cancel button clicks", () => {
    const onPauseToggle = jest.fn();
    const onCancel = jest.fn();

    render(
      <UploadProgressPill
        progress={55}
        isPaused={false}
        onPauseToggle={onPauseToggle}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "พักการอัปโหลด" }));
    expect(onPauseToggle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกการอัปโหลด" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
