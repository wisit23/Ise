import { render, screen } from "@testing-library/react";
import ArticlesPage from "./page";
import { apiFetch } from "../../lib/api";

jest.mock(
  "../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock(
  "../../components/Footer",
  () =>
    function MockFooter() {
      return <footer aria-label="footer" />;
    },
);

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("ArticlesPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("shows empty state when no articles are found", async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0, totalPages: 1 });

    render(<ArticlesPage />);

    expect(await screen.findByText("ไม่พบบทความ")).toBeInTheDocument();
  });

  it("renders article cards when data is available", async () => {
    apiFetch.mockResolvedValue({
      items: [
        {
          id: "art-test-1",
          title: "5 วิธีดูแลเสื้อผ้ามือสองให้เหมือนใหม่",
          summary: "เคล็ดลับการถนอมผ้า",
          content: "เนื้อหาละเอียด",
          category: "care",
          authorName: "ฝ่ายการตลาด",
          publishedAt: "2026-09-06T12:00:00.000Z",
        },
      ],
      total: 1,
      totalPages: 1,
    });

    render(<ArticlesPage />);

    expect(
      await screen.findByText("5 วิธีดูแลเสื้อผ้ามือสองให้เหมือนใหม่"),
    ).toBeInTheDocument();
    expect(screen.getByText("เคล็ดลับการถนอมผ้า")).toBeInTheDocument();
    expect(screen.getAllByText("การดูแลเสื้อผ้า").length).toBeGreaterThanOrEqual(1);
  });

  it("shows error message when API fails", async () => {
    apiFetch.mockRejectedValue(new Error("Network Error"));

    render(<ArticlesPage />);

    expect(await screen.findByText(/Network Error/)).toBeInTheDocument();
  });
});
