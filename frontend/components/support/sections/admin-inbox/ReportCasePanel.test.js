import { fireEvent, render, screen } from "@testing-library/react";
import ReportCasePanel from "./ReportCasePanel";

test("claimed review reports offer removal and explain its effect", () => {
  render(<ReportCasePanel
    report={{ id: "review-report", reporterId: "reporter", targetId: "buyer", reason: "[รายงานรีวิว #review-1] spam", status: "REVIEWED", reviewedBy: "staff" }}
    currentUserId="staff" decision="REMOVE_REVIEW" reason="spam" onDecisionChange={() => {}} onReasonChange={() => {}} onSubmit={() => {}}
  />);
  expect(screen.getByText(/รีวิวนี้จะถูกลบออกจากหน้าร้าน/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /ลบรีวิวที่ถูกรายงาน/ }));
  expect(screen.getByRole("radio", { name: /ลบรีวิวที่ถูกรายงาน/ })).toBeInTheDocument();
});

test("shows report category without product or chat controls", () => {
  render(<ReportCasePanel
    report={{
      id: "report-1", reporterId: "buyer-1", targetId: "seller-1",
      productId: "legacy-product-1", category: "FRAUD", reason: "ร้านหลอกลวง",
      status: "OPEN", evidence: [],
    }}
    currentUserId="staff-1"
    onClaim={() => {}}
  />);

  expect(screen.getByText("หลอกลวงหรือฉ้อโกง")).toBeInTheDocument();
  expect(screen.queryByText("สินค้าเป้าหมาย:")).not.toBeInTheDocument();
  expect(screen.getByText("รายละเอียดสินค้า")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /View Product/ })).toHaveAttribute("href", "/products/legacy-product-1");
  expect(screen.queryByText("ดูบทสนทนาก่อนหน้า")).not.toBeInTheDocument();
});
