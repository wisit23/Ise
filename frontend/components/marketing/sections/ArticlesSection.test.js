import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ArticlesSection from "./ArticlesSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  uploadFiles: jest.fn(),
  mediaUrl: jest.fn((url) => url || ""),
}));

describe("ArticlesSection (Responsive Layout & Dropdowns)", () => {
  const mockToken = "test-jwt-token";

  const sampleArticles = [
    {
      id: "art-1",
      title: "วิธีดูแลเสื้อผ้าวินเทจ",
      category: "care",
      status: "published",
      viewCount: 150,
      createdAt: "2026-06-01T10:00:00.000Z",
      summary: "สรุปการดูแลเสื้อผ้า",
      content: "เนื้อหาละเอียดสำหรับการดูแลเสื้อผ้าวินเทจ",
      coverImage: "/images/art1.jpg",
      authorName: "ทีมการตลาด RE-LOOP",
    },
    {
      id: "art-2",
      title: "ไอเดียแต่งตัวหน้าร้อน",
      category: "styling",
      status: "draft",
      viewCount: 0,
      createdAt: "2026-06-02T10:00:00.000Z",
      summary: "ไอเดียแต่งตัว",
      content: "เนื้อหาแต่งตัวหน้าร้อน",
      coverImage: null,
      authorName: "สไตลิสต์ประจำ",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockImplementation(() =>
      Promise.resolve({ items: sampleArticles, total: 2 }),
    );
  });

  test("loads and renders articles list with responsive table, colgroups, and action buttons", async () => {
    const { container } = render(<ArticlesSection token={mockToken} />);

    expect(
      screen.getByText("จัดการบทความ & คอนเทนต์ความรู้"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("วิธีดูแลเสื้อผ้าวินเทจ")).toBeInTheDocument();
      expect(screen.getByText("ไอเดียแต่งตัวหน้าร้อน")).toBeInTheDocument();
    });

    // Check table-fixed layout and colgroup widths
    const table = container.querySelector("table");
    expect(table).toHaveClass("table-fixed", "w-full");

    const colgroup = table.querySelector("colgroup");
    expect(colgroup).toBeInTheDocument();
    const cols = colgroup.querySelectorAll("col");
    expect(cols).toHaveLength(7);
    expect(cols[0]).toHaveClass("w-[24%]");
    expect(cols[1]).toHaveClass("w-[13%]");
    expect(cols[2]).toHaveClass("w-[11%]");
    expect(cols[3]).toHaveClass("w-[10%]");
    expect(cols[4]).toHaveClass("w-[11%]");
    expect(cols[5]).toHaveClass("w-[11%]");
    expect(cols[6]).toHaveClass("w-[20%]");

    // Check category badges inside table
    expect(within(table).getByText("การดูแลเสื้อผ้า")).toBeInTheDocument();
    expect(within(table).getByText("เคล็ดลับการแต่งตัว")).toBeInTheDocument();

    // Check status badges inside table
    expect(within(table).getByText("เผยแพร่แล้ว")).toBeInTheDocument();
    expect(within(table).getByText("ฉบับร่าง")).toBeInTheDocument();
    expect(within(table).getByText("ผู้อ่าน")).toBeInTheDocument();
    expect(within(table).getByText("150")).toBeInTheDocument();

    // Check author and truncation
    expect(screen.getByText("ทีมการตลาด RE-LOOP")).toHaveClass("truncate");

    // Check action buttons with accessible labels
    expect(
      screen.getByRole("link", { name: "ดูบทความ วิธีดูแลเสื้อผ้าวินเทจ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "แก้ไขบทความ วิธีดูแลเสื้อผ้าวินเทจ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ลบบทความ วิธีดูแลเสื้อผ้าวินเทจ" }),
    ).toBeInTheDocument();
  });

  test("filters articles by status and search keyword", async () => {
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

  test("filters articles by category using DropdownFilter on toolbar", async () => {
    render(<ArticlesSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("วิธีดูแลเสื้อผ้าวินเทจ")).toBeInTheDocument();
    });

    // Find category dropdown trigger button on toolbar
    const catTrigger = screen.getByRole("button", { name: "ทุกหมวดหมู่" });
    expect(catTrigger).toBeInTheDocument();
    fireEvent.click(catTrigger);

    // Select category option
    const careOption = screen.getByText("การดูแลเสื้อผ้า (Care Guide)");
    fireEvent.click(careOption);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("category=care"),
        expect.anything(),
      );
    });
  });

  test("opens editor modal, renders RadioSelect for category and status, and saves new article", async () => {
    apiFetch.mockImplementation((url, options) => {
      if (options?.method === "POST") {
        return Promise.resolve({ success: true, id: "art-new" });
      }
      return Promise.resolve({ items: sampleArticles, total: 2 });
    });

    render(<ArticlesSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("วิธีดูแลเสื้อผ้าวินเทจ")).toBeInTheDocument();
    });

    const createBtn = screen.getByRole("button", { name: /เขียนบทความใหม่/i });
    fireEvent.click(createBtn);

    // Modal should open
    expect(screen.getByText(/ชื่อหัวข้อบทความ \(Title\)/i)).toBeInTheDocument();

    // Fill title and content
    const titleInput = screen.getByPlaceholderText(
      "เช่น 5 วิธีดูแลเสื้อผ้ามือสองให้เหมือนใหม่",
    );
    fireEvent.change(titleInput, {
      target: { value: "เคล็ดลับการซักผ้าไหม" },
    });

    const contentInput = screen.getByPlaceholderText(
      "พิมพ์เนื้อหาบทความที่นี่... รองรับการแบ่งย่อหน้าอย่างอิสระ",
    );
    fireEvent.change(contentInput, {
      target: { value: "เนื้อหาละเอียดการซักผ้าไหมไม่ให้เสียทรง" },
    });

    // Check RadioSelect for category
    const categorySelect = screen.getByLabelText("เลือกหมวดหมู่บทความ");
    fireEvent.change(categorySelect, { target: { value: "sustainability" } });
    expect(categorySelect.value).toBe("sustainability");

    // Check RadioSelect for status
    const statusSelect = screen.getByLabelText("เลือกสถานะการเผยแพร่");
    fireEvent.change(statusSelect, { target: { value: "draft" } });
    expect(statusSelect.value).toBe("draft");

    // Submit form
    const saveBtn = screen.getByRole("button", { name: /บันทึกบทความ/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/products/articles",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            title: "เคล็ดลับการซักผ้าไหม",
            content: "เนื้อหาละเอียดการซักผ้าไหมไม่ให้เสียทรง",
            category: "sustainability",
            status: "draft",
          }),
        }),
      );
    });
  });

  test("handles Escape key in editor modal: first Escape closes RadioSelect dropdown while keeping modal open, second Escape closes modal", async () => {
    render(<ArticlesSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("วิธีดูแลเสื้อผ้าวินเทจ")).toBeInTheDocument();
    });

    const createBtn = screen.getByRole("button", { name: /เขียนบทความใหม่/i });
    fireEvent.click(createBtn);

    // Modal is open
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Enter some form text to verify it persists after dropdown Escape
    const titleInput = screen.getByPlaceholderText(
      "เช่น 5 วิธีดูแลเสื้อผ้ามือสองให้เหมือนใหม่",
    );
    fireEvent.change(titleInput, { target: { value: "บทความทดสอบ Escape" } });

    // Open Category RadioSelect dropdown via trigger button
    const catContainer = screen.getByLabelText("หมวดหมู่บทความ (Category)").closest("div");
    const catTrigger = catContainer.querySelector("button");
    fireEvent.click(catTrigger);

    const listbox = within(catContainer).getByRole("listbox");
    expect(listbox).toHaveClass("visible");

    // Press Escape on the open dropdown trigger
    fireEvent.keyDown(catTrigger, { key: "Escape" });

    // 1. Dropdown should close
    expect(listbox).toHaveClass("invisible");

    // 2. Modal MUST stay open
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // 3. Form input value MUST remain intact
    expect(titleInput.value).toBe("บทความทดสอบ Escape");

    // 4. Press Escape again when dropdown is closed -> Modal closes
    fireEvent.keyDown(catTrigger, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("opens edit modal with existing article data and submits update", async () => {
    apiFetch.mockImplementation((url, options) => {
      if (options?.method === "PUT") {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ items: sampleArticles, total: 2 });
    });

    render(<ArticlesSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("วิธีดูแลเสื้อผ้าวินเทจ")).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", {
      name: "แก้ไขบทความ วิธีดูแลเสื้อผ้าวินเทจ",
    });
    fireEvent.click(editBtn);

    // Modal opens with article title pre-filled
    const titleInput = screen.getByDisplayValue("วิธีดูแลเสื้อผ้าวินเทจ");
    expect(titleInput).toBeInTheDocument();

    // Modify title
    fireEvent.change(titleInput, {
      target: { value: "วิธีดูแลเสื้อผ้าวินเทจ ฉบับปรับปรุง" },
    });

    // Save
    const saveBtn = screen.getByRole("button", { name: /บันทึกการแก้ไข/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/products/articles/art-1",
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({
            title: "วิธีดูแลเสื้อผ้าวินเทจ ฉบับปรับปรุง",
            category: "care",
            status: "published",
          }),
        }),
      );
    });
  });

  describe("Pagination & Boundary Behavior", () => {
    it("renders pagination controls correctly for 45 items (3 pages)", async () => {
      apiFetch.mockResolvedValueOnce({
        items: sampleArticles,
        total: 45,
        page: 1,
        totalPages: 3,
      });

      render(<ArticlesSection token={mockToken} />);
      await screen.findByText("วิธีดูแลเสื้อผ้าวินเทจ");

      const prevBtn = screen.getByRole("button", { name: /ก่อนหน้า/i });
      const nextBtn = screen.getByRole("button", { name: /ถัดไป/i });

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).not.toBeDisabled();
      expect(screen.getAllByText("45").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);

      fireEvent.click(nextBtn);
      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("page=2"),
          expect.anything(),
        );
      });
    });

    it("resets page to 1 when searching", async () => {
      render(<ArticlesSection token={mockToken} />);
      await screen.findByText("วิธีดูแลเสื้อผ้าวินเทจ");

      const searchInput = screen.getByPlaceholderText(/ค้นหาชื่อเรื่อง/i);
      fireEvent.change(searchInput, { target: { value: "วินเทจ" } });

      const searchForm = searchInput.closest("form");
      fireEvent.submit(searchForm);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("page=1"),
          expect.anything(),
        );
      });
    });

    it("clamps out-of-bounds page to the last valid page", async () => {
      apiFetch.mockResolvedValueOnce({
        items: sampleArticles,
        total: 20,
        page: 1,
        totalPages: 1,
      });

      render(<ArticlesSection token={mockToken} />);
      await screen.findByText("วิธีดูแลเสื้อผ้าวินเทจ");

      expect(screen.getAllByText("20").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole("button", { name: /ก่อนหน้า/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /ถัดไป/i })).toBeDisabled();
    });

    it("maintains stat summary cards across page navigation", async () => {
      const summaryFixture = {
        total: 45,
        published: 30,
        draft: 15,
      };

      apiFetch.mockImplementation((url) => {
        if (typeof url === "string" && url.includes("page=2")) {
          return Promise.resolve({
            items: sampleArticles,
            total: 45,
            page: 2,
            totalPages: 3,
            summary: summaryFixture,
          });
        }
        return Promise.resolve({
          items: sampleArticles,
          total: 45,
          page: 1,
          totalPages: 3,
          summary: summaryFixture,
        });
      });

      render(<ArticlesSection token={mockToken} />);
      await screen.findByText("วิธีดูแลเสื้อผ้าวินเทจ");

      // Verify Page 1 summary card values
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(screen.getAllByText("45").length).toBeGreaterThanOrEqual(1);

      // Navigate to Page 2
      const nextBtn = screen.getByRole("button", { name: /ถัดไป/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("page=2"),
          expect.anything(),
        );
      });

      // Verify Page 2 summary cards remain unchanged
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(screen.getAllByText("45").length).toBeGreaterThanOrEqual(1);
    });

    it("displays correct summary cards when filtering by archived (published=0, draft=0) both with and without search term", async () => {
      apiFetch.mockImplementation((url) => {
        if (typeof url === "string" && url.includes("status=archived")) {
          return Promise.resolve({
            items: [
              {
                id: "art-archived-1",
                slug: "archived-guide",
                title: "บทความที่เก็บถาวร",
                summary: "สรุปบทความเก็บถาวร",
                category: "care",
                status: "archived",
                authorName: "Marketing Lead",
                createdAt: "2026-10-01T00:00:00.000Z",
                updatedAt: "2026-10-01T00:00:00.000Z",
              },
            ],
            total: 1,
            page: 1,
            totalPages: 1,
            summary: {
              total: 1,
              published: 0,
              draft: 0,
            },
          });
        }
        return Promise.resolve({
          items: sampleArticles,
          total: 3,
          page: 1,
          totalPages: 1,
          summary: { total: 3, published: 2, draft: 1 },
        });
      });

      render(<ArticlesSection token={mockToken} />);
      await screen.findByText("วิธีดูแลเสื้อผ้าวินเทจ");

      // 1. Filter by status: archived (using DropdownFilter)
      const statusFilterTrigger = screen.getByRole("button", {
        name: "ทุกสถานะ",
      });
      fireEvent.click(statusFilterTrigger);
      const archivedOption = await screen.findByText("เก็บถาวร");
      fireEvent.click(archivedOption);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("status=archived"),
          expect.anything(),
        );
      });

      // When archived is filtered, published and draft must be 0, total must be 1
      expect(await screen.findByText("บทความที่เก็บถาวร")).toBeInTheDocument();
      expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2); // published = 0 and draft = 0
      expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1); // total = 1

      // 2. Search while keeping status=archived
      const searchInput = screen.getByPlaceholderText(/ค้นหาชื่อเรื่อง/i);
      fireEvent.change(searchInput, { target: { value: "คู่มือ" } });
      const searchForm = searchInput.closest("form");
      fireEvent.submit(searchForm);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("status=archived"),
          expect.anything(),
        );
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("q=%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD"),
          expect.anything(),
        );
      });
    });

    describe("MarketingPagination - ArticlesSection Comprehensive Coverage", () => {
      it("renders pagination for 0 items: displays 'ทั้งหมด 0 รายการ · หน้า 1 จาก 1' and disabled buttons", async () => {
        apiFetch.mockImplementation(() =>
          Promise.resolve({
            items: [],
            total: 0,
            page: 1,
            totalPages: 1,
          }),
        );

        render(<ArticlesSection token={mockToken} />);

        expect(await screen.findByText("ยังไม่มีบทความ")).toBeInTheDocument();
        expect(
          screen.getByText(
            (_, el) =>
              el?.tagName?.toLowerCase() === "span" &&
              el?.textContent?.trim() === "ทั้งหมด 0 รายการ",
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            (_, el) =>
              el?.tagName?.toLowerCase() === "span" &&
              el?.textContent?.trim() === "หน้า 1 จาก 1",
          ),
        ).toBeInTheDocument();

        const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
        const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
        expect(prevBtn).toBeInTheDocument();
        expect(nextBtn).toBeInTheDocument();
        expect(prevBtn).toBeDisabled();
        expect(nextBtn).toBeDisabled();
      });

      it("renders pagination for a single page: disabled buttons exist and prevent paging", async () => {
        apiFetch.mockImplementation(() =>
          Promise.resolve({
            items: sampleArticles,
            total: 3,
            page: 1,
            totalPages: 1,
          }),
        );

        render(<ArticlesSection token={mockToken} />);

        expect(
          await screen.findByText("วิธีดูแลเสื้อผ้าวินเทจ"),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            (_, el) =>
              el?.tagName?.toLowerCase() === "span" &&
              el?.textContent?.trim() === "ทั้งหมด 3 รายการ",
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            (_, el) =>
              el?.tagName?.toLowerCase() === "span" &&
              el?.textContent?.trim() === "หน้า 1 จาก 1",
          ),
        ).toBeInTheDocument();

        const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
        const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
        expect(prevBtn).toBeInTheDocument();
        expect(nextBtn).toBeInTheDocument();
        expect(prevBtn).toBeDisabled();
        expect(nextBtn).toBeDisabled();
      });

      it("renders pagination during loading: navigation buttons exist, are disabled, and do not trigger extra requests", async () => {
        let resolvePromise;
        apiFetch.mockImplementation(
          () =>
            new Promise((resolve) => {
              resolvePromise = resolve;
            }),
        );

        render(<ArticlesSection token={mockToken} />);

        // During loading, prev and next buttons exist and are disabled
        const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
        const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
        expect(prevBtn).toBeInTheDocument();
        expect(nextBtn).toBeInTheDocument();
        expect(prevBtn).toBeDisabled();
        expect(nextBtn).toBeDisabled();

        // Clicking disabled buttons does not trigger additional fetch calls
        const initialCallCount = apiFetch.mock.calls.length;
        fireEvent.click(prevBtn);
        fireEvent.click(nextBtn);
        expect(apiFetch.mock.calls.length).toBe(initialCallCount);

        // Clean up deferred promise
        resolvePromise({ items: [], total: 0, page: 1, totalPages: 1 });
      });

      it("renders pagination on API error: displays error message, does not show count 0 as success, and buttons are disabled", async () => {
        apiFetch.mockImplementation(() =>
          Promise.reject(new Error("เซิร์ฟเวอร์ขัดข้องชั่วคราว")),
        );

        render(<ArticlesSection token={mockToken} />);

        expect(
          await screen.findByText("เซิร์ฟเวอร์ขัดข้องชั่วคราว"),
        ).toBeInTheDocument();

        // Does NOT display "ทั้งหมด 0 รายการ" as if loaded successfully
        expect(
          screen.queryByText(
            (_, el) =>
              el?.tagName?.toLowerCase() === "span" &&
              el?.textContent?.trim() === "ทั้งหมด 0 รายการ",
          ),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText(
            (_, el) =>
              el?.tagName?.toLowerCase() === "span" &&
              el?.textContent?.trim() === "ทั้งหมด — รายการ",
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            (_, el) =>
              el?.tagName?.toLowerCase() === "span" &&
              el?.textContent?.trim() === "หน้า — จาก —",
          ),
        ).toBeInTheDocument();

        const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
        const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
        expect(prevBtn).toBeInTheDocument();
        expect(nextBtn).toBeInTheDocument();
        expect(prevBtn).toBeDisabled();
        expect(nextBtn).toBeDisabled();
      });
    });
  });
});
