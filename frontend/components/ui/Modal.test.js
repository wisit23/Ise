import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Modal from "./Modal";

function Harness({ onClose }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>เปิด</button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        title="ยืนยันการระงับบัญชี"
      >
        <input aria-label="เหตุผล" />
        <button>ยืนยัน</button>
      </Modal>
    </>
  );
}

test("closes on Escape", () => {
  const onClose = jest.fn();
  render(<Harness onClose={onClose} />);

  fireEvent.click(screen.getByText("เปิด"));
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole("dialog").parentElement, {
    key: "Escape",
  });
  expect(onClose).toHaveBeenCalled();
});

test("labels itself with its title and traps focus inside the panel", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("เปิด"));

  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(dialog).toHaveAccessibleName("ยืนยันการระงับบัญชี");

  // Focus lands inside the dialog rather than staying on the page behind it.
  expect(dialog.contains(document.activeElement)).toBe(true);

  // Tabbing off the last control wraps back to the first.
  const focusables = dialog.querySelectorAll("button, input");
  const last = focusables[focusables.length - 1];
  act(() => last.focus());
  fireEvent.keyDown(dialog.parentElement, { key: "Tab" });
  expect(document.activeElement).toBe(focusables[0]);
});

test("returns focus to whatever opened it", () => {
  render(<Harness />);
  const trigger = screen.getByText("เปิด");

  // fireEvent.click does not move focus the way a real click does, so put it
  // where the browser would have.
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("dialog").parentElement, {
    key: "Escape",
  });

  expect(document.activeElement).toBe(trigger);
});

test("renders nothing while closed", () => {
  render(<Harness />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
