import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "../../app/login/page";
import RegisterPage from "../../app/register/page";
import VerifyPage from "../../app/verify-email/page";
import { apiFetch } from "../../lib/api";
import { saveSession } from "../../lib/auth";

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
  saveSession: jest.fn(),
}));
jest.mock(
  "./AuthScene",
  () =>
    function MockAuthScene() {
      return null;
    },
);

const RESENT = "If that email belongs to an account waiting for confirmation, a new link is on its way.";

beforeEach(() => {
  apiFetch.mockReset();
  saveSession.mockReset();
  window.history.replaceState(null, "", "/");
});

function signUp() {
  render(<RegisterPage />);
  fireEvent.change(screen.getByLabelText(/^first name/i), { target: { value: "Mali" } });
  fireEvent.change(screen.getByLabelText(/^last name/i), { target: { value: "Dee" } });
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "mali@example.com" } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "long-enough-1" } });
  fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
}

describe("sign up with verification required", () => {
  it("asks the user to check their email instead of signing them in", async () => {
    apiFetch.mockResolvedValue({
      verificationRequired: true,
      email: "mali@example.com",
      expiresInHours: 24,
    });
    signUp();

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText("mali@example.com")).toBeInTheDocument();
    expect(screen.getByText(/expires in 24 hours/)).toBeInTheDocument();
    expect(saveSession).not.toHaveBeenCalled();
  });

  it("can send another confirmation link from the same screen", async () => {
    apiFetch
      .mockResolvedValueOnce({ verificationRequired: true, email: "mali@example.com" })
      .mockResolvedValueOnce({ message: RESENT });
    signUp();
    fireEvent.click(await screen.findByRole("button", { name: /new confirmation link/i }));

    expect(await screen.findByText(RESENT)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenLastCalledWith("/api/auth/email/resend", {
      method: "POST",
      body: { email: "mali@example.com" },
    });
  });

  it("still signs the user straight in when the server does not require it", async () => {
    apiFetch.mockResolvedValue({ accessToken: "a", refreshToken: "r", user: { id: "u1" } });
    signUp();
    await waitFor(() =>
      expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "a" })),
    );
    expect(screen.queryByText("Check your email")).toBeNull();
  });
});

describe("sign in before confirming", () => {
  it("explains why and offers a new link for the email that was typed", async () => {
    apiFetch
      .mockRejectedValueOnce(
        Object.assign(new Error("Please confirm your email before signing in."), {
          status: 403,
          code: "EMAIL_NOT_VERIFIED",
        }),
      )
      .mockResolvedValueOnce({ message: RESENT });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: " mali@example.com " } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "long-enough-1" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/confirm your email/i);
    fireEvent.click(screen.getByRole("button", { name: /new confirmation link/i }));
    expect(await screen.findByText(RESENT)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenLastCalledWith("/api/auth/email/resend", {
      method: "POST",
      body: { email: "mali@example.com" },
    });
  });

  it("does not offer a resend for an ordinary wrong password", async () => {
    apiFetch.mockRejectedValue(Object.assign(new Error("invalid email or password"), { status: 400 }));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "mali@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "nope-nope-1" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /new confirmation link/i })).toBeNull();
  });
});

describe("confirmation link", () => {
  it("confirms the email from the fragment and removes the token from the URL", async () => {
    apiFetch.mockResolvedValue(null);
    window.history.replaceState(null, "", "/verify-email#token=tok_1");
    render(<VerifyPage />);

    expect(await screen.findByText("Email confirmed")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/email/verify", {
      method: "POST",
      body: { token: "tok_1" },
    });
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("link", { name: /go to sign in/i })).toHaveAttribute("href", "/login");
  });

  it("offers a new link when the server rejects the token", async () => {
    apiFetch.mockRejectedValue(
      Object.assign(new Error("invalid"), { status: 400, code: "VERIFICATION_TOKEN_INVALID" }),
    );
    window.history.replaceState(null, "", "/verify-email#token=old");
    render(<VerifyPage />);

    expect(await screen.findByText("This link can't be used")).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
  });

  it("retries with the same token after a temporary failure", async () => {
    apiFetch
      .mockRejectedValueOnce(Object.assign(new Error("down"), { status: 503 }))
      .mockResolvedValueOnce(null);
    window.history.replaceState(null, "", "/verify-email#token=tok_2");
    render(<VerifyPage />);

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Email confirmed")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenLastCalledWith("/api/auth/email/verify", {
      method: "POST",
      body: { token: "tok_2" },
    });
  });

  it("shows the expired state when opened without a token", async () => {
    render(<VerifyPage />);
    expect(await screen.findByText("This link can't be used")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
