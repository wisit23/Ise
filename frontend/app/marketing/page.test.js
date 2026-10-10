import { render, screen, fireEvent } from "@testing-library/react";
import MarketingPanelPage from "./page";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import { useRouter } from "next/navigation";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

jest.mock("../../components/NavBar", () => {
  return function MockNavBar() {
    return <div data-testid="mock-navbar">NavBar</div>;
  };
});

jest.mock("../../components/marketing/sections/DashboardSection", () => {
  return function MockDashboardSection({ onNavigate }) {
    return (
      <div data-testid="dashboard-section">
        <span>Mock Dashboard Section</span>
        <button onClick={() => onNavigate("campaigns")}>Go to Campaigns</button>
      </div>
    );
  };
});

jest.mock("../../components/marketing/sections/CampaignsSection", () => {
  return function MockCampaignsSection() {
    return <div data-testid="campaigns-section">Mock Campaigns Section</div>;
  };
});

jest.mock("../../components/marketing/sections/AuctionScheduleSection", () => {
  return function MockAuctionScheduleSection() {
    return <div data-testid="auctions-section">Mock Auctions Section</div>;
  };
});

jest.mock("../../components/marketing/sections/ArticlesSection", () => {
  return function MockArticlesSection() {
    return <div data-testid="articles-section">Mock Articles Section</div>;
  };
});

jest.mock("../../components/marketing/sections/AuditTrailSection", () => {
  return function MockAuditTrailSection() {
    return <div data-testid="audit-section">Mock Audit Trail Section</div>;
  };
});

describe("MarketingPanelPage (Responsive Layout & Navigation)", () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
  });

  test("redirects to /login when no access token is found", () => {
    getAccessToken.mockReturnValue(null);
    getStoredUser.mockReturnValue(null);

    render(<MarketingPanelPage />);

    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  test("shows access restriction message when user role is not MARKETING", () => {
    getAccessToken.mockReturnValue("valid-token");
    getStoredUser.mockReturnValue({ id: "user-1", role: "USER" });

    render(<MarketingPanelPage />);

    expect(
      screen.getByText(
        "หน้านี้ใช้ได้เฉพาะบัญชีฝ่ายการตลาด (Marketing) เท่านั้น",
      ),
    ).toBeInTheDocument();
  });

  test("renders responsive sidebar and mobile section selector for MARKETING role", () => {
    getAccessToken.mockReturnValue("valid-token");
    getStoredUser.mockReturnValue({ id: "marketing-1", role: "MARKETING" });

    const { container } = render(<MarketingPanelPage />);

    // Sidebar should have responsive classes hidden on mobile/tablet, flex on lg
    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();
    expect(aside.className).toContain("hidden");
    expect(aside.className).toContain("lg:flex");

    // Mobile nav wrapper should have lg:hidden
    const mobileNavWrapper = aside.parentElement.querySelector(".lg\\:hidden");
    expect(mobileNavWrapper).toBeInTheDocument();

    // Default active section is dashboard
    expect(screen.getByTestId("dashboard-section")).toBeInTheDocument();
  });

  test("switches section when sidebar nav button is clicked", () => {
    getAccessToken.mockReturnValue("valid-token");
    getStoredUser.mockReturnValue({ id: "marketing-1", role: "MARKETING" });

    render(<MarketingPanelPage />);

    // Switch to campaigns
    const campaignBtn = screen.getByRole("button", { name: /แคมเปญและคูปอง/i });
    fireEvent.click(campaignBtn);
    expect(screen.getByTestId("campaigns-section")).toBeInTheDocument();

    // Switch to auctions
    const auctionsBtn = screen.getByRole("button", { name: /ตารางประมูล/i });
    fireEvent.click(auctionsBtn);
    expect(screen.getByTestId("auctions-section")).toBeInTheDocument();

    // Switch to articles
    const articlesBtn = screen.getByRole("button", { name: /จัดการบทความ/i });
    fireEvent.click(articlesBtn);
    expect(screen.getByTestId("articles-section")).toBeInTheDocument();

    // Switch to audit trail
    const auditBtn = screen.getByRole("button", {
      name: /ประวัติการดำเนินงาน/i,
    });
    fireEvent.click(auditBtn);
    expect(screen.getByTestId("audit-section")).toBeInTheDocument();
  });

  test("switches section via onNavigate callback from dashboard", () => {
    getAccessToken.mockReturnValue("valid-token");
    getStoredUser.mockReturnValue({ id: "marketing-1", role: "MARKETING" });

    render(<MarketingPanelPage />);

    expect(screen.getByTestId("dashboard-section")).toBeInTheDocument();

    const navigateBtn = screen.getByRole("button", {
      name: /Go to Campaigns/i,
    });
    fireEvent.click(navigateBtn);

    expect(screen.getByTestId("campaigns-section")).toBeInTheDocument();
  });

  test("switches section via Mobile RadioSelect dropdown", () => {
    getAccessToken.mockReturnValue("valid-token");
    getStoredUser.mockReturnValue({ id: "marketing-1", role: "MARKETING" });

    const { container } = render(<MarketingPanelPage />);

    // Locate the mobile navigation container
    const mobileNavWrapper = container.querySelector(".lg\\:hidden");
    expect(mobileNavWrapper).toBeInTheDocument();

    // Find the trigger button of RadioSelect inside mobileNavWrapper
    const triggerBtn = mobileNavWrapper.querySelector(
      "button[aria-haspopup='listbox']",
    );
    expect(triggerBtn).toBeInTheDocument();

    // Click to open the dropdown
    fireEvent.click(triggerBtn);

    // Click the "แคมเปญและคูปอง" option in the opened dropdown
    const campaignOption = mobileNavWrapper.querySelector(
      "label[for*='campaigns']",
    );
    expect(campaignOption).toBeInTheDocument();
    fireEvent.click(campaignOption);

    // Verify section switched to campaigns
    expect(screen.getByTestId("campaigns-section")).toBeInTheDocument();

    // Also switch to articles via mobile dropdown
    fireEvent.click(triggerBtn);
    const articlesOption = mobileNavWrapper.querySelector(
      "label[for*='articles']",
    );
    expect(articlesOption).toBeInTheDocument();
    fireEvent.click(articlesOption);

    // Verify section switched to articles
    expect(screen.getByTestId("articles-section")).toBeInTheDocument();

    // Also switch to audit trail via mobile dropdown
    fireEvent.click(triggerBtn);
    const auditOption = mobileNavWrapper.querySelector("label[for*='audit']");
    expect(auditOption).toBeInTheDocument();
    fireEvent.click(auditOption);

    // Verify section switched to audit
    expect(screen.getByTestId("audit-section")).toBeInTheDocument();
  });
});
