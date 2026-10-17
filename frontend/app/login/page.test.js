import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "./page";
import { apiFetch } from "../../lib/api";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

function accessTokenFor(roles) {
  const payload = btoa(
    JSON.stringify({ sub: "marketing-1", role: roles[0], roles }),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
}

function submitLogin() {
  fireEvent.change(screen.getByLabelText(/^อีเมล/), {
    target: { value: "marketing@example.test" },
  });
  fireEvent.change(screen.getByLabelText(/^รหัสผ่าน/), {
    target: { value: "valid-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
}

describe("LoginPage redirect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, "", "/login");
  });

  test("redirects Marketing to /marketing after successful login", async () => {
    apiFetch.mockResolvedValue({
      accessToken: accessTokenFor(["MARKETING"]),
      refreshToken: "refresh-token",
      user: { id: "marketing-1", role: "MARKETING" },
    });

    render(<LoginPage />);
    submitLogin();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/marketing"));
  });

  test.each([
    ["next", "/seller/onboarding", ["SELLER"]],
    ["returnTo", "/campaigns?tab=mine", ["BUYER"]],
    ["redirect", "/campaigns?tab=mine", ["BUYER"]],
  ])(
    "preserves a safe destination from the %s parameter",
    async (parameter, destination, roles) => {
      const encodedDestination = encodeURIComponent(destination);
      window.history.replaceState(
        {},
        "",
        `/login?${parameter}=${encodedDestination}`,
      );
      apiFetch.mockResolvedValue({
        accessToken: accessTokenFor(roles),
        refreshToken: "refresh-token",
        user: { id: "returning-user", role: roles[0] },
      });

      render(<LoginPage />);
      submitLogin();

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith(destination));
    },
  );

  test("does not redirect when authentication fails", async () => {
    apiFetch.mockRejectedValue(new Error("invalid email or password"));

    render(<LoginPage />);
    submitLogin();

    expect(
      await screen.findByText("invalid email or password"),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
