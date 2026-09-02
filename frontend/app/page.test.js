import { render, screen, waitFor } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the marketplace headline", async () => {
    render(<HomePage />);
    // Asserts the actual headline rather than just the brand name, which
    // used to be in the h1 only because the old copy repeated it — the
    // brand already has its own link in the header.
    expect(
      screen.getByRole("heading", { level: 1, name: /ชีวิตรอบสอง/ }),
    ).toBeInTheDocument();
    // The page kicks off a fetch on mount; let it settle so the state update
    // doesn't land outside act().
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("renders guest navigation links when no user is logged in", async () => {
    render(<HomePage />);
    expect(
      screen.getByRole("link", { name: "เข้าสู่ระบบ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "สมัครสมาชิก" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("offers a retry instead of a blank page when the feed cannot load", async () => {
    render(<HomePage />);

    // There is no API in the test environment, so the fetch rejects — which is
    // exactly the case that used to render as empty space.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("โหลดข้อมูลไม่สำเร็จ");
    expect(screen.getByRole("button", { name: /ลองใหม่/ })).toBeInTheDocument();
  });
});
