import { render, screen } from "@testing-library/react";
import ReportCasePanel from "./ReportCasePanel";

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
  expect(screen.getByText("Product Details")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /View Product/ })).toHaveAttribute("href", "/products/legacy-product-1");
  expect(screen.queryByText("ดูบทสนทนาก่อนหน้า")).not.toBeInTheDocument();
});
