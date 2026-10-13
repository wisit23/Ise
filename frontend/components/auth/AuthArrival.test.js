import { fireEvent, render, screen, act } from "@testing-library/react";
import AuthArrival, { useAuthTransition } from "./AuthArrival";
let mockPath = "/login";
jest.mock("next/navigation", () => ({ usePathname: () => mockPath }));
function Trigger() {
  const { begin, phase } = useAuthTransition();
  return <button onClick={() => begin("/")}>{phase}</button>;
}
afterEach(() => jest.useRealTimers());
it("keeps the same overlay across navigation and reveals only after destination mounts", () => {
  jest.useFakeTimers();
  mockPath = "/login";
  const view = render(
    <AuthArrival>
      <Trigger />
    </AuthArrival>,
  );
  fireEvent.click(screen.getByRole("button"));
  const overlay = screen.getByRole("status");
  act(() => jest.advanceTimersByTime(3000));
  expect(screen.getByRole("button")).toHaveTextContent("covering");
  mockPath = "/";
  view.rerender(
    <AuthArrival>
      <Trigger />
    </AuthArrival>,
  );
  expect(screen.getByRole("status")).toBe(overlay);
  expect(screen.getByRole("button")).toHaveTextContent("revealing");
  act(() => jest.advanceTimersByTime(720));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
