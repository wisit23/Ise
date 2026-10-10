import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ArticlesSection from "./ArticlesSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  uploadFiles: jest.fn(),
  mediaUrl: jest.fn((url) => url || ""),
}));

describe("ArticlesSection (Responsive Layout & Functionality)", () => {
  const mockToken = "test-jwt-token";

  const sampleArticles = [
    {
      id: "art-1",
      title: "วิธีดูแลเสื้อผ้าวินเทจ",
      category: "care",
      status: "published",
      viewCount: 150,
      createdAt: "2026-06-01T10:00:00.000Z",
      summary: "สรุปการดูแล",
      content: "เนื้อหาละเอียด",
      coverImage: "/images/art1.jpg",
    },
    {
      id: "art-2",
      title: "ไอเดียแต่งตัวหน้าร้อน",
      category: "styling",
      status: "draft",
      viewCount: 0,
      createdAt: "2026-06-02T10:00:00.000Z",
      summary: "ไอเดีย",
      content: "เนื้อหา",
      coverImage: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("loads and renders articles list with responsive table", async () => {
    apiFetch.mockResolvedValueOnce({ items: sampleArticles, total: 2 });

    render(<ArticlesSection token={mockToken} />);

    expect(
      screen.getByText("จัดการบทความ & คอนเทนต์ความรู้"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("วิธีดูแลเสื้อผ้าวินเทจ")).toBeInTheDocument();
      expect(screen.getByText("ไอเดียแต่งตัวหน้าร้อน")).toBeInTheDocument();
    });

    // Check category badges
    expect(screen.getByText("การดูแลเสื้อผ้า")).toBeInTheDocument();
    expect(screen.getByText("เคล็ดลับการแต่งตัว")).toBeInTheDocument();
  });

  test("filters articles by status and search keyword", async () => {
    apiFetch.mockResolvedValue({ items: sampleArticles, total: 2 });

    render(<ArticlesSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("วิธีดูแลเสื้อผ้าวินเทจ")).toBeInTheDocument();
    });

    // Search input
    const searchInput = screen.getByPlaceholderText(
      "ค้นหาชื่อเรื่องหรือเนื้อหา...",
    );
    fireEvent.change(searchInput, { target: { value: "วินเทจ" } });

    // Submit search form
    const searchForm = searchInput.closest("form");
    if (searchForm) {
      fireEvent.submit(searchForm);
    }

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "q=%E0%B8%A7%E0%B8%B4%E0%B8%99%E0%B9%80%E0%B8%97%E0%B8%88",
      ),
      expect.anything(),
    );
  });

  test("opens editor modal when clicking 'เขียนบทความใหม่'", async () => {
    apiFetch.mockResolvedValue({ items: sampleArticles, total: 2 });

    render(<ArticlesSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("วิธีดูแลเสื้อผ้าวินเทจ")).toBeInTheDocument();
    });

    const createBtn = screen.getByRole("button", { name: /เขียนบทความใหม่/i });
    fireEvent.click(createBtn);

    // Modal should open
    expect(screen.getByText(/ชื่อหัวข้อบทความ \(Title\)/i)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("เช่น 5 วิธีดูแลเสื้อผ้ามือสองให้เหมือนใหม่"),
    ).toBeInTheDocument();

    // Close modal
    const cancelBtn = screen.getByRole("button", { name: /ยกเลิก/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(
          "เช่น 5 วิธีดูแลเสื้อผ้ามือสองให้เหมือนใหม่",
        ),
      ).not.toBeInTheDocument();
    });
  });
});
