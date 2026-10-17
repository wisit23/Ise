import { fireEvent, render, screen, within } from "@testing-library/react";
import AuctionItemFilters from "./AuctionItemFilters";

const rounds = [
  { id: "active-1", title: "รอบกำลังเปิด", phase: "submission", auctionEndsAt: "2026-10-20T12:00:00Z" },
  { id: "upcoming-1", title: "รอบเดือนหน้า", phase: "upcoming", auctionEndsAt: "2026-11-20T12:00:00Z" },
  { id: "ended-old", title: "รอบจบเดือนกันยายน", phase: "ended", auctionEndsAt: "2026-09-10T12:00:00Z" },
  { id: "ended-new", title: "รอบจบเดือนตุลาคม", phase: "ended", auctionEndsAt: "2026-10-10T12:00:00Z" },
  { id: "cancelled-1", title: "รอบที่ถูกยกเลิก", phase: "cancelled", auctionEndsAt: "2026-10-12T12:00:00Z" },
];

function renderFilters(overrides = {}) {
  const props = {
    rounds,
    selectedRoundIds: [],
    onRoundIdsChange: jest.fn(),
    statusOptions: [
      { value: "pending_approval", label: "รออนุมัติจาก Marketing" },
      { value: "approved", label: "อนุมัติแล้ว รอกำหนดเวลา" },
      { value: "cancelled", label: "ยกเลิกแล้ว" },
    ],
    selectedStatuses: [],
    onStatusesChange: jest.fn(),
    searchValue: "",
    onSearchChange: jest.fn(),
    onSearchSubmit: jest.fn(),
    ...overrides,
  };
  render(<AuctionItemFilters {...props} />);
  return props;
}

test("separates cancelled rounds from ended rounds", () => {
  renderFilters();
  fireEvent.click(screen.getByRole("button", { name: /ทุกรอบประมูล/ }));

  fireEvent.click(screen.getByRole("button", { name: /จบแล้ว/ }));
  expect(screen.getByRole("checkbox", { name: "รอบจบเดือนกันยายน" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "รอบที่ถูกยกเลิก" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /ยกเลิกรอบ/ }));
  expect(screen.getByRole("checkbox", { name: "รอบที่ถูกยกเลิก" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "รอบจบเดือนกันยายน" })).not.toBeInTheDocument();
});

test("selects every round in one group with a checkbox", () => {
  const props = renderFilters();
  fireEvent.click(screen.getByRole("button", { name: /ทุกรอบประมูล/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "ทั้งหมดในกลุ่ม เปิดอยู่" }));
  expect(props.onRoundIdsChange).toHaveBeenCalledWith(["active-1"]);
});

test("limits ended round choices by date range", () => {
  renderFilters();
  fireEvent.click(screen.getByRole("button", { name: /ทุกรอบประมูล/ }));
  fireEvent.click(screen.getByRole("button", { name: /จบแล้ว/ }));
  fireEvent.change(screen.getByLabelText("ตั้งแต่วันที่"), { target: { value: "2026-10-01" } });

  expect(screen.getByRole("checkbox", { name: "รอบจบเดือนตุลาคม" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "รอบจบเดือนกันยายน" })).not.toBeInTheDocument();
});

test("status checkboxes and search call their handlers", () => {
  const props = renderFilters();
  fireEvent.click(screen.getByRole("button", { name: /ทุกสถานะ/ }));
  const dialog = screen.getByRole("dialog", { name: "สถานะรายการ" });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "รออนุมัติจาก Marketing" }));
  expect(props.onStatusesChange).toHaveBeenCalledWith(["pending_approval"]);

  fireEvent.change(screen.getByRole("searchbox", { name: "ค้นหาชื่อสินค้าหรือร้านค้า" }), {
    target: { value: "ร้านวินเทจ" },
  });
  expect(props.onSearchChange).toHaveBeenCalledWith("ร้านวินเทจ");
  fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
  expect(props.onSearchSubmit).toHaveBeenCalledTimes(1);
});

test.each([
  ["รอบประมูล", /ทุกรอบประมูล/],
  ["สถานะรายการ", /ทุกสถานะ/],
])("uses one scroll container across the whole %s popover", (dialogName, triggerName) => {
  renderFilters();
  fireEvent.click(screen.getByRole("button", { name: triggerName }));

  const dialog = screen.getByRole("dialog", { name: dialogName });
  expect(dialog).toHaveClass("overflow-y-auto");
  expect(dialog.querySelectorAll(".overflow-y-auto")).toHaveLength(0);
});
