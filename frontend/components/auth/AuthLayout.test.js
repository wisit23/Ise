import { act, render } from "@testing-library/react";
import AuthLayout from "./AuthLayout";
import { AUTH_ENTRANCE_MS } from "./authMotion";
jest.mock(
  "./AuthScene",
  () =>
    function Scene() {
      return null;
    },
);
beforeEach(() => {
  jest.useFakeTimers();
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});
afterEach(() => {
  jest.useRealTimers();
  delete global.ResizeObserver;
});

test("inert blocks the center only during departure without passing a React inert prop", () => {
  const view = render(
    <AuthLayout mode="login">
      <input aria-label="Email" />
    </AuthLayout>,
  );
  const center = view.container.querySelector("header").nextElementSibling;
  expect(center).not.toHaveAttribute("inert");
  view.rerender(
    <AuthLayout mode="login" departing>
      <input aria-label="Email" />
    </AuthLayout>,
  );
  expect(center).toHaveAttribute("inert");
  view.rerender(
    <AuthLayout mode="login">
      <input aria-label="Email" />
    </AuthLayout>,
  );
  expect(center).not.toHaveAttribute("inert");
});

test("finishing the entrance does not replay the form; changing tabs still animates", () => {
  const view = render(
    <AuthLayout mode="login">
      <div data-testid="form-body" />
    </AuthLayout>,
  );
  const form = view.container.querySelector(
    "[data-testid='form-body']",
  ).parentElement;
  expect(form).toHaveClass("initialForm");
  act(() => jest.advanceTimersByTime(AUTH_ENTRANCE_MS));
  expect(view.container.querySelector("main")).not.toHaveClass("arriving");
  expect(form).toHaveClass("initialForm");
  view.rerender(
    <AuthLayout mode="register">
      <div data-testid="form-body" />
    </AuthLayout>,
  );
  expect(
    view.container.querySelector("[data-testid='form-body']").parentElement,
  ).not.toHaveClass("initialForm");
});
