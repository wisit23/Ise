import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForgotPage from "../../app/forgot-password/page";
import ResetPage from "../../app/reset-password/page";
import LoginPage from "../../app/login/page";
import { apiFetch } from "../../lib/api";
import { clearSession } from "../../lib/auth";
import { passwordProblem } from "../../lib/passwordReset";

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
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({
  ...jest.requireActual("../../lib/auth"),
  clearSession: jest.fn(),
}));
jest.mock(
  "./AuthScene",
  () =>
    function MockAuthScene() {
      return null;
    },
);

const SENT = "If an account exists for that email, a reset link is on its way.";
const invalidTokenError = () =>
  Object.assign(new Error("invalid"), { status: 400, code: "RESET_TOKEN_INVALID" });

beforeEach(() => {
  apiFetch.mockReset();
  clearSession.mockReset();
  window.history.replaceState(null, "", "/");
});

function openResetLink(token) {
  window.history.replaceState(null, "", `/reset-password#token=${token}`);
  render(<ResetPage />);
}

function fillNewPassword(password, confirmation = password) {
  fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/^confirm new password/i), {
    target: { value: confirmation },
  });
  fireEvent.click(screen.getByRole("button", { name: /update password/i }));
}

describe("sign in", () => {
  it("offers a way to recover a forgotten password", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});

describe("forgot password", () => {
  it("sends the trimmed email and shows the server's neutral confirmation", async () => {
    apiFetch.mockResolvedValue({ message: SENT });
    render(<ForgotPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "  me@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(SENT)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/password/forgot", {
      method: "POST",
      body: { email: "me@example.com" },
    });
  });

  it("explains a rate limit instead of pretending the email went out", async () => {
    apiFetch.mockRejectedValue(Object.assign(new Error("Too many"), { status: 429 }));
    render(<ForgotPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "me@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
    expect(screen.queryByText(SENT)).toBeNull();
  });
});

describe("reset password", () => {
  it("rejects a visit without a token without calling the server", async () => {
    render(<ResetPage />);
    expect(await screen.findByText("This link can't be used")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("reads the token from the fragment, then removes it from the address bar", async () => {
    apiFetch.mockResolvedValue({ expiresAt: "2026-10-21T10:30:00.000Z" });
    openResetLink("tok_123");

    expect(await screen.findByLabelText(/^new password/i)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/password/reset/verify", {
      method: "POST",
      body: { token: "tok_123" },
    });
    expect(window.location.hash).toBe("");
  });

  it("shows the expired state when the server rejects the token", async () => {
    apiFetch.mockRejectedValue(invalidTokenError());
    openResetLink("old");
    expect(await screen.findByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("catches mismatched passwords before submitting", async () => {
    apiFetch.mockResolvedValue({});
    openResetLink("tok_123");
    await screen.findByLabelText(/^new password/i);
    fillNewPassword("brand-new-pass-1", "brand-new-pass-2");

    expect(await screen.findByRole("alert")).toHaveTextContent("The two passwords don't match.");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("updates the password, drops the local session and points to sign in", async () => {
    apiFetch.mockResolvedValueOnce({}).mockResolvedValueOnce(null);
    openResetLink("tok_123");
    await screen.findByLabelText(/^new password/i);
    fillNewPassword("brand-new-pass-1");

    expect(await screen.findByText("Password updated")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenLastCalledWith("/api/auth/password/reset", {
      method: "POST",
      body: { token: "tok_123", password: "brand-new-pass-1" },
    });
    expect(clearSession).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /go to sign in/i })).toHaveAttribute("href", "/login");
  });

  it("falls back to the expired state if the link dies while the form is open", async () => {
    apiFetch.mockResolvedValueOnce({}).mockRejectedValueOnce(invalidTokenError());
    openResetLink("tok_123");
    await screen.findByLabelText(/^new password/i);
    fillNewPassword("brand-new-pass-1");

    await waitFor(() => expect(screen.getByText("This link can't be used")).toBeInTheDocument());
    expect(clearSession).not.toHaveBeenCalled();
  });
});

describe("passwordProblem", () => {
  it("mirrors the server's password policy", () => {
    expect(passwordProblem("short", "short")).toMatch(/at least 8/);
    expect(passwordProblem("ก".repeat(25), "ก".repeat(25))).toMatch(/too long/);
    expect(passwordProblem("long-enough-1", "long-enough-2")).toMatch(/don't match/);
    expect(passwordProblem("long-enough-1", "long-enough-1")).toBeNull();
  });
});
