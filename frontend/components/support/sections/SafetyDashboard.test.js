import { render, screen, fireEvent, within } from "@testing-library/react";
import DashboardSection from "./DashboardSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock(
  "./AgentDashboard",
  () =>
    function MockAgentDashboard() {
      return <div>CS dashboard</div>;
    },
);

const trend = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-10-${String(i + 1).padStart(2, "0")}`,
  count: i + 1,
}));
beforeEach(() => {
  apiFetch.mockImplementation(async (url) => {
    if (url.includes("tickets/dashboard"))
      return {
        total: 120,
        status: {
          NEW: 20,
          IN_PROGRESS: 10,
          RESOLVED: 60,
          CLOSED: 15,
          ESCALATED: 15,
        },
        priority: { LOW: 20, NORMAL: 65, HIGH: 20, URGENT: 15 },
        trend,
        hourlyTrend: Array.from({ length: 24 }, (_, hour) => ({
          hour: `${String(hour).padStart(2, "0")}:00`,
          count: hour === 9 ? 4 : 0,
        })),
      };
    if (url.includes("disputes/dashboard"))
      return { disputesByStatus: { OPEN: 8, NEEDS_INFO: 3, DECIDED: 12 } };
    if (url.includes("auth")) return { pendingKyc: 12, openReports: 7 };
    return { activeTrustSafetyHolds: 4 };
  });
});

test("time filters change the daily series without changing current workload", async () => {
  const navigate = jest.fn();
  render(
    <DashboardSection token="test" userRole="ADMIN" onNavigate={navigate} />,
  );
  const chart = await screen.findByRole("group", {
    name: "กราฟแนวโน้มจำนวนเคสใหม่รายวัน",
  });
  expect(within(chart).getAllByRole("button")).toHaveLength(7);
  const filters = screen.getByRole("group", { name: "ช่วงเวลากราฟเคสใหม่" });
  for (const [label, count] of [
    ["วันนี้", 24],
    ["14 วัน", 14],
    ["30 วัน", 30],
    ["7 วัน", 7],
  ]) {
    fireEvent.click(
      within(filters).getByRole("button", { name: label, exact: true }),
    );
    expect(
      within(
        screen.getByRole("group", {
          name:
            label === "วันนี้"
              ? "กราฟแนวโน้มจำนวนเคสใหม่รายชั่วโมง"
              : "กราฟแนวโน้มจำนวนเคสใหม่รายวัน",
        }),
      ).getAllByRole("button"),
    ).toHaveLength(count);
    if (label === "วันนี้") {
      expect(screen.getByText("เฉลี่ยต่อชั่วโมง")).toBeVisible();
      expect(screen.getByText("สูงสุดต่อชั่วโมง")).toBeVisible();
      fireEvent.focus(screen.getByRole("button", { name: "09:00: 4 เคส" }));
      expect(screen.getByText("4 เคส", { selector: "strong" })).toBeVisible();
    }
    expect(
      within(filters).getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen
        .getByText("เคสทั้งหมด", { selector: ".metricTop > span" })
        .closest(".metric"),
    ).toHaveTextContent("120");
  }
  fireEvent.click(screen.getByRole("button", { name: /ยืนยันตัวตนรอตรวจ/ }));
  expect(navigate).toHaveBeenCalledWith("kyc", "");
});
