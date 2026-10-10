import { act, render, screen } from "@testing-library/react";
import TypingIndicator from "./TypingIndicator";

test("keeps the bubble visible as its animated height grows and cleans up", () => {
  const originalObserver = global.ResizeObserver;
  let resize;
  const disconnect = jest.fn();
  global.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnect(); }
  };
  const frame = jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { callback(); return 1; });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  try {
    const { rerender, unmount } = render(<div className="overflow-y-auto" data-testid="scroll"><TypingIndicator typing={false} /></div>);
    const scroll = screen.getByTestId("scroll");
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 500 });
    rerender(<div className="overflow-y-auto" data-testid="scroll"><TypingIndicator typing /></div>);
    expect(scroll.scrollTop).toBe(500);
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 550 });
    act(() => resize());
    expect(scroll.scrollTop).toBe(550);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  } finally {
    global.ResizeObserver = originalObserver;
    frame.mockRestore();
    cancel.mockRestore();
  }
});
