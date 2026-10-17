import { render, screen } from "@testing-library/react";
import PopularCategories from "./PopularCategories";

const rows = [
  { id: "a", label: "เสื้อยืด", count: 6, gmv: 1200 },
  { id: "b", label: "กระเป๋า", count: 3, gmv: 9000 },
];

describe("PopularCategories", () => {
  it("shows name, pieces sold, share of all pieces and the amount", () => {
    render(<PopularCategories rows={rows} total={{ count: 12, gmv: 20000 }} />);

    const first = screen.getByText("เสื้อยืด").closest("li");
    expect(first).toHaveTextContent("1");
    expect(first).toHaveTextContent("6 ชิ้น");
    expect(first).toHaveTextContent("50%");
    expect(first).toHaveTextContent("฿1,200");

    const second = screen.getByText("กระเป๋า").closest("li");
    expect(second).toHaveTextContent("3 ชิ้น");
    expect(second).toHaveTextContent("25%");
    expect(second).toHaveTextContent("฿9,000");
  });

  it("takes the share from all sales, not only the listed rows", () => {
    render(<PopularCategories rows={rows.slice(0, 1)} total={{ count: 30 }} />);
    expect(screen.getByText("เสื้อยืด").closest("li")).toHaveTextContent("20%");
  });

  it("falls back to the listed rows when no total is given", () => {
    render(<PopularCategories rows={rows} />);
    expect(screen.getByText("เสื้อยืด").closest("li")).toHaveTextContent("67%");
  });

  it("names a sale with no known category itself", () => {
    render(
      <PopularCategories
        rows={[{ id: "__uncategorized__", label: null, count: 2, gmv: 300 }]}
        total={{ count: 2, gmv: 300 }}
      />,
    );
    expect(screen.getByText("ไม่ระบุหมวดหมู่")).toBeVisible();
  });

  it("says unavailable, not empty, when the service did not answer", () => {
    render(<PopularCategories rows={null} emptyText="ว่าง" />);
    expect(screen.getByText("ไม่พร้อมใช้งาน")).toBeInTheDocument();
  });

  it("says nothing has sold when there are no rows", () => {
    render(<PopularCategories rows={[]} emptyText="ยังไม่มีสินค้าที่ขายได้" />);
    expect(screen.getByText("ยังไม่มีสินค้าที่ขายได้")).toBeInTheDocument();
  });
});
