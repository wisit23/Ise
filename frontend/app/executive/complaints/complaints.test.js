import { render, screen, fireEvent } from "@testing-library/react";
import ExecutiveComplaintsPage from "./page";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

jest.mock(
  "../../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock("../../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

describe("ExecutiveComplaintsPage", () => {
  beforeEach(() => {
    getAccessToken.mockReturnValue("token");
    getStoredUser.mockReturnValue({ role: "EXECUTIVE", firstName: "อัสนัย" });
  });

  it("restricts the page to Executive accounts", async () => {
    getStoredUser.mockReturnValue({ role: "SELLER", firstName: "ผู้ขาย" });

    render(<ExecutiveComplaintsPage />);

    expect(
      await screen.findByText("หน้านี้ใช้ได้เฉพาะบัญชีผู้บริหารเท่านั้น"),
    ).toBeInTheDocument();
  });

  it("shows the empty state — the reports table is not wired up yet", async () => {
    render(<ExecutiveComplaintsPage />);

    expect(
      await screen.findByText("ไม่มีข้อร้องเรียนในหมวดนี้"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ยังไม่ได้เชื่อมข้อมูลข้อร้องเรียนจริง/),
    ).toBeInTheDocument();
  });

  it("still renders the filter tabs and stat tiles as placeholders", async () => {
    render(<ExecutiveComplaintsPage />);

    await screen.findByText("ไม่มีข้อร้องเรียนในหมวดนี้");

    expect(screen.getByRole("button", { name: "ที่ยังเปิดอยู่" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("เรื่องที่ยังเปิดอยู่")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยกคำร้อง" }));
    expect(screen.getByRole("button", { name: "ยกคำร้อง" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Switching tabs never fetches — the empty state stays the same either way.
    expect(
      screen.getByText("ไม่มีข้อร้องเรียนในหมวดนี้"),
    ).toBeInTheDocument();
  });
});
