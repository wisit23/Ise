import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "../../app/login/page";
import RegisterPage from "../../app/register/page";
import { apiFetch } from "../../lib/api";
import { saveSession } from "../../lib/auth";

const mockPush = jest.fn();
const originalResizeObserver = global.ResizeObserver;
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});
afterAll(() => {
  global.ResizeObserver = originalResizeObserver;
});
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({
  ...jest.requireActual("../../lib/auth"),
  saveSession: jest.fn(),
}));
jest.mock(
  "./AuthScene",
  () =>
    function MockAuthScene() {
      return null;
    },
);

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, "", "/login");
});

it("preserves login credentials, session saving and executive routing", async () => {
  const session = { accessToken: "test-token", user: { role: "EXECUTIVE" } };
  apiFetch.mockResolvedValue(session);
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText(/^Email/), {
    target: { value: "test@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: "test-password" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
  await waitFor(() =>
    expect(document.querySelector("main")).toHaveAttribute("aria-busy", "true"),
  );
  expect(mockPush).not.toHaveBeenCalled();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/executive"), {
    timeout: 2500,
  });
  expect(apiFetch).toHaveBeenCalledWith("/api/auth/login", {
    method: "POST",
    body: { email: "test@example.com", password: "test-password" },
  });
  expect(saveSession).toHaveBeenCalledWith(session);
});

it("keeps all registration fields, optional phone, password constraints and the BUYER payload", async () => {
  apiFetch.mockResolvedValue({ user: { role: "BUYER" } });
  render(<RegisterPage />);
  for (const [label, value] of [
    ["First name", "Test"],
    ["Last name", "User"],
    ["Email", "test@example.com"],
    ["Password", "test-password"],
  ]) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {
      target: { value },
    });
  }
  expect(screen.getByLabelText("Phone number")).not.toBeRequired();
  const password = screen.getByLabelText(/^Password/);
  expect(password).toHaveAttribute("minlength", "8");
  expect(password).toHaveAttribute("autocomplete", "new-password");
  expect(password).toBeRequired();
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(password).toHaveAttribute("type", "text");
  expect(password).toHaveValue("test-password");
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(password).toHaveAttribute("type", "password");
  fireEvent.submit(screen.getByRole("form", { name: "Sign up" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"), {
    timeout: 2500,
  });
  expect(apiFetch).toHaveBeenCalledWith("/api/auth/register", {
    method: "POST",
    body: {
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      password: "test-password",
      phone: "",
      role: "BUYER",
    },
  });
});

it("shows API errors and re-enables submission", async () => {
  apiFetch.mockRejectedValue(new Error("Incorrect email or password."));
  render(<LoginPage />);
  fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
  expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Incorrect email or password.",
  );
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(saveSession).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("retains the suspended-account notice", () => {
  window.history.replaceState({}, "", "/login?reason=suspended");
  render(<LoginPage />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This account has been suspended",
  );
});

it("switches forms in place and restores sign in with browser history", async () => {
  render(<LoginPage />);
  const main = document.querySelector("main");
  fireEvent.click(screen.getAllByRole("link", { name: "Sign up" })[0]);
  expect(window.location.pathname).toBe("/register");
  expect(screen.getByLabelText(/^First name/)).toBeRequired();
  expect(document.querySelector("main")).toBe(main);
  window.history.replaceState({}, "", "/login");
  fireEvent.popState(window);
  expect(screen.getByRole("form", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.queryByLabelText(/^First name/)).not.toBeInTheDocument();
  expect(document.querySelector("main")).toBe(main);
});
