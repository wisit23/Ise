import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import AuthScene from "./AuthScene";
import { createAuthScene } from "./createAuthScene";

jest.mock("./createAuthScene", () => ({ createAuthScene: jest.fn() }));

let media;
let engine;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  media = new Map();
  engine = {
    dispose: jest.fn(),
    setPaused: jest.fn(),
    setReducedMotion: jest.fn(),
  };
  createAuthScene.mockReset().mockReturnValue(engine);
  window.matchMedia = jest.fn((query) => {
    if (!media.has(query))
      media.set(query, {
        matches: query.includes("min-width"),
        listener: null,
        addEventListener(_, listener) {
          this.listener = listener;
        },
        removeEventListener() {
          this.listener = null;
        },
      });
    return media.get(query);
  });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

it("does not initialize WebGL on mobile", async () => {
  window.matchMedia("(min-width: 901px)").matches = false;
  const { container } = render(<AuthScene />);
  await act(async () => {});
  expect(createAuthScene).not.toHaveBeenCalled();
  expect(container.querySelector("canvas")).toBeNull();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("supports pause and disposes the renderer when switching to mobile", async () => {
  render(<AuthScene />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Pause 3D animation" }),
  );
  expect(engine.setPaused).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "Resume 3D animation" }));
  expect(engine.setPaused).toHaveBeenLastCalledWith(false);
  act(() => {
    const desktop = media.get("(min-width: 901px)");
    desktop.matches = false;
    desktop.listener();
  });
  expect(engine.dispose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("renders a still scene for reduced motion and cleans up on navigation", async () => {
  window.matchMedia("(prefers-reduced-motion: reduce)").matches = true;
  const { unmount } = render(<AuthScene />);
  await waitFor(() =>
    expect(createAuthScene).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ reducedMotion: true }),
    ),
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  unmount();
  expect(engine.dispose).toHaveBeenCalledTimes(1);
  expect(media.get("(prefers-reduced-motion: reduce)").listener).toBeNull();
});
