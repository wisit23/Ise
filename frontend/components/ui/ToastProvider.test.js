import { render, screen, act, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger() {
  const toast = useToast();
  return (
    <button onClick={() => toast.success("ระงับบัญชีผู้ใช้สำเร็จ")}>
      ระงับบัญชี
    </button>
  );
}

test("shows a toast and dismisses it on its own", () => {
  jest.useFakeTimers();

  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );

  fireEvent.click(screen.getByText("ระงับบัญชี"));
  expect(screen.getByText("ระงับบัญชีผู้ใช้สำเร็จ")).toBeInTheDocument();

  act(() => jest.advanceTimersByTime(4000));
  expect(screen.queryByText("ระงับบัญชีผู้ใช้สำเร็จ")).not.toBeInTheDocument();

  jest.useRealTimers();
});

test("useToast outside a provider fails loudly instead of silently", () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
  spy.mockRestore();
});
