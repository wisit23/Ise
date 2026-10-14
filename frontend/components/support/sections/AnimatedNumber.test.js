import { act, render } from "@testing-library/react";
import AnimatedNumber from "./AnimatedNumber";

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.restoreAllMocks();
});

test.each([false, true])("counts up with OS reduced motion set to %s", (reduced) => {
  window.matchMedia = jest.fn(() => ({ matches: reduced }));
  let tick;
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const { container, unmount } = render(<AnimatedNumber value={1234} />);
  const number = container.querySelector("[data-animated-number]");
  expect(number).toHaveTextContent("0");
  expect(tick).toEqual(expect.any(Function));
  act(() => tick(performance.now() + 1200));
  expect(number).toHaveTextContent(Number(1234).toLocaleString("th-TH"));
  unmount();
  expect(cancel).toHaveBeenCalledWith(1);
});
