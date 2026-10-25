import { fireEvent, render, screen } from "@testing-library/react";
import ReportCasePanel from "./ReportCasePanel";
import { rememberReferenceCodes } from "../../../../lib/referenceCodes";

test("report identities and embedded review references use readable codes, while history actions retain internal IDs", () => {
  const reporterId = "65b9f696-6fef-49d7-8047-4f7647d45dde";
  const targetId = "7cfea9d6-2d6e-438b-a36a-f5b5a193cdb7";
  const reviewId = "4ea3a615-56d8-409f-9060-05f1facdc1fa";
  const reporterCode = "USR-7K3M-9X2R-4T6W";
  const targetCode = "USR-8K3M-9X2R-4T6W";
  const report = rememberReferenceCodes({ id: "report-readable", reporterId, targetId, status: "OPEN", reason: `[รายงานรีวิว #${reviewId}] spam (เนื้อหารีวิว: "ข้อความเดิม\nพร้อม "คำอ้างอิง"")`, reporter: { id: reporterId, referenceCode: reporterCode, firstName: "ผู้แจ้ง" }, target: { id: targetId, referenceCode: targetCode, firstName: "คู่กรณี" }, reviewDetail: { available: true, review: { id: reviewId, referenceCode: "REV-7K3M-9X2R-4T6W" } } });
  const onHistory = jest.fn();
  const { container } = render(<ReportCasePanel report={report} currentUserId="staff" onOpenUserHistory={onHistory} />);
  expect(screen.getAllByText(reporterCode)).toHaveLength(2);
  expect(screen.getAllByText(targetCode)).toHaveLength(2);
  expect(screen.getByText("REV-7K3M-9X2R-4T6W")).toBeInTheDocument();
  expect(screen.getByText("spam", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("เหตุผลที่รายงาน")).toBeInTheDocument();
  expect(screen.getAllByText("รีวิวที่ถูกรายงาน")).toHaveLength(1);
  expect(container.querySelector("blockquote")).toHaveTextContent('ข้อความเดิม พร้อม "คำอ้างอิง"');
  expect(screen.getByText("ดูรายละเอียดต้นฉบับ").closest("details")).not.toHaveAttribute("open");
  expect(container.textContent).not.toMatch(/65b9f696|7cfea9d6|4ea3a615/);
  fireEvent.click(screen.getAllByRole("button", { name: "เปิดประวัติผู้ใช้" })[0]);
  expect(onHistory).toHaveBeenCalledWith(reporterId);
});

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
