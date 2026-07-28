import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the marketplace headline", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /RE-LOOP/ }),
    ).toBeInTheDocument();
  });

  it("renders guest navigation links when no user is logged in", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("link", { name: "เข้าสู่ระบบ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "สมัครสมาชิก" }),
    ).toBeInTheDocument();
  });
});
