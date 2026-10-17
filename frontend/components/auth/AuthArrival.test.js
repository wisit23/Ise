import { fireEvent, render, screen, act } from "@testing-library/react";
import AuthArrival, { useAuthTransition } from "./AuthArrival";
import { AUTH_RETURN_COVER_MS, AUTH_REVEAL_MS } from "./authMotion";
let mockPath = "/login";
const mockRouter = { push: jest.fn(), prefetch: jest.fn() };
jest.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => mockRouter,
}));
function ReadyButton() {
  const { markAuthReady } = useAuthTransition();
  return <button onClick={() => markAuthReady("/login")}>Login mounted</button>;
}
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
  act(() => jest.advanceTimersByTime(AUTH_REVEAL_MS));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("covers shopping before returning to login and keeps the overlay until login mounts", () => {
  jest.useFakeTimers();
  mockRouter.push.mockClear();
  mockPath = "/products";
  const children = (
    <>
      <a href="/login?reason=suspended">Sign in</a>
      <ReadyButton />
    </>
  );
  const view = render(<AuthArrival>{children}</AuthArrival>);
  fireEvent.click(screen.getByRole("link"));
  const overlay = screen.getByRole("status", { name: "Opening sign in" });
  expect(mockRouter.push).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(AUTH_RETURN_COVER_MS));
  expect(mockRouter.push).toHaveBeenCalledWith("/login?reason=suspended");
  mockPath = "/login";
  view.rerender(<AuthArrival>{children}</AuthArrival>);
  expect(screen.getByRole("status")).toBe(overlay);
  act(() => jest.advanceTimersByTime(AUTH_REVEAL_MS));
  expect(screen.getByRole("status")).toBe(overlay);
  fireEvent.click(screen.getByRole("button", { name: "Login mounted" }));
  act(() => jest.advanceTimersByTime(AUTH_REVEAL_MS));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("leaves modified clicks and in-place auth tabs alone", () => {
  mockPath = "/products";
  const children = <a href="/login">Sign in</a>;
  const view = render(<AuthArrival>{children}</AuthArrival>);
  fireEvent.click(screen.getByRole("link"), { ctrlKey: true });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  mockPath = "/register";
  view.rerender(<AuthArrival>{children}</AuthArrival>);
  fireEvent.click(screen.getByRole("link"));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("cancels a pending return on unmount and releases the cover if navigation fails", () => {
  jest.useFakeTimers();
  mockRouter.push.mockClear();
  mockPath = "/products";
  const children = <a href="/login">Sign in</a>;
  const first = render(<AuthArrival>{children}</AuthArrival>);
  fireEvent.click(screen.getByRole("link"));
  first.unmount();
  act(() => jest.advanceTimersByTime(AUTH_RETURN_COVER_MS));
  expect(mockRouter.push).not.toHaveBeenCalled();
  render(<AuthArrival>{children}</AuthArrival>);
  fireEvent.click(screen.getByRole("link"));
  act(() => jest.advanceTimersByTime(10000));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
