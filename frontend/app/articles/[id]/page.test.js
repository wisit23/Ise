import { act, render, screen, waitFor } from "@testing-library/react";
import ArticleDetailPage from "./page";
import { apiFetch } from "../../../lib/api";
import { scheduleVisibleArticleDwell } from "../../../lib/articleViews";

jest.mock(
  "../../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock(
  "../../../components/Footer",
  () =>
    function MockFooter() {
      return <footer aria-label="footer" />;
    },
);

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "article-1" }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: jest.fn((url) => url),
}));

jest.mock("../../../lib/articleViews", () => ({
  ARTICLE_VIEW_DWELL_MS: 20_000,
  getArticleViewSessionId: jest.fn(() => "guest-session-123456"),
  scheduleVisibleArticleDwell: jest.fn(),
}));

const article = {
  id: "article-1",
  title: "อ่านแฟชั่นอย่างยั่งยืน",
  summary: "สรุปบทความ",
  content: "เนื้อหาบทความสำหรับทดสอบ",
  category: "care",
  status: "published",
  authorName: "ฝ่ายการตลาด",
  publishedAt: "2026-10-17T05:00:00.000Z",
  viewCount: 12,
};

describe("ArticleDetailPage unique reader tracking", () => {
  let finishDwell;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduleVisibleArticleDwell.mockImplementation((callback) => {
      finishDwell = callback;
      return jest.fn();
    });
    apiFetch.mockImplementation((path, options) => {
      if (path === "/api/products/articles/article-1" && !options) {
        return Promise.resolve({ article });
      }
      if (path.includes("?category=")) {
        return Promise.resolve({ items: [] });
      }
      if (path.endsWith("/views/start")) {
        return Promise.resolve({ alreadyCounted: false, dwellMs: 20_000 });
      }
      if (path.endsWith("/views/complete")) {
        return Promise.resolve({ counted: true, viewCount: 13 });
      }
      throw new Error(`Unexpected API call: ${path}`);
    });
  });

  test("shows the shared count and updates it only after dwell completion", async () => {
    render(<ArticleDetailPage />);

    expect(await screen.findByText("ผู้อ่าน 12 คน")).toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/products/articles/article-1/views/start",
        {
          method: "POST",
          body: { guestSessionId: "guest-session-123456" },
        },
      ),
    );

    await act(async () => {
      await finishDwell();
    });

    expect(await screen.findByText("ผู้อ่าน 13 คน")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/articles/article-1/views/complete",
      {
        method: "POST",
        body: { guestSessionId: "guest-session-123456" },
      },
    );
  });
});
