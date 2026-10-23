import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryBars, DailyVolume } from "./SafetyDashboardCharts";

test("failed requests show an error instead of an empty workload", () => {
  render(<CategoryBars data={[]} error="offline" />);
  expect(screen.getByRole("status")).toHaveTextContent("โหลดข้อมูลไม่สำเร็จ");
  expect(
    screen.queryByText("ยังไม่มีเคสในข้อมูลชุดนี้"),
  ).not.toBeInTheDocument();
});

test("zero workloads stay readable without invalid percentages", () => {
  const { container } = render(
    <CategoryBars data={[{ label: "เร่งด่วน", value: 0 }]} />,
  );
  expect(screen.getByText("เร่งด่วน")).toBeInTheDocument();
  expect(screen.getByText("0%")).toBeInTheDocument();
  expect(screen.getByText("ยังไม่มีเคสในข้อมูลชุดนี้")).toBeInTheDocument();
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
});

test("daily values are available without hovering, including zero days", () => {
  render(
    <DailyVolume
      data={[
        { label: "16 ต.ค.", value: 12 },
        { label: "17 ต.ค.", value: 0 },
      ]}
    />,
  );
  expect(
    screen.getByRole("button", { name: "16 ต.ค.: 12 เคส" }),
  ).toBeInTheDocument();
  fireEvent.focus(screen.getByRole("button", { name: "16 ต.ค.: 12 เคส" }));
  expect(screen.getByText("16 ต.ค.", { selector: "span" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "17 ต.ค.: 0 เคส" }),
  ).toBeInTheDocument();
});

test("a single zero day has valid coordinates and a clear empty message", () => {
  const { container } = render(
    <DailyVolume data={[{ label: "วันนี้", value: 0 }]} />,
  );
  expect(screen.getByText("ไม่มีเคสใหม่ในช่วงเวลานี้")).toBeVisible();
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  expect(screen.getByRole("button", { name: "วันนี้: 0 เคส" })).toHaveAttribute(
    "cx",
    "466",
  );
});
