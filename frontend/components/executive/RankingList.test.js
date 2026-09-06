import { render, screen } from "@testing-library/react";
import RankingList from "./RankingList";

describe("RankingList (Horizontal In-Bar Bar Chart)", () => {
  it("renders unavailable state when owner service fails", () => {
    render(<RankingList unavailable={true} />);
    expect(screen.getByText("ไม่พร้อมใช้งาน")).toBeInTheDocument();
  });

  it("renders empty state when rows array is empty", () => {
    render(
      <RankingList
        rows={[]}
        emptyText="ยังไม่มีสินค้าที่ขายได้ในเดือนนี้"
        unavailable={false}
      />,
    );
    expect(
      screen.getByText("ยังไม่มีสินค้าที่ขายได้ในเดือนนี้"),
    ).toBeInTheDocument();
  });

  it("renders horizontal bars with direct in-bar labels, values, and percentage shares", () => {
    const mockRows = [
      { id: "cat-1", label: "เสื้อผ้าแฟชั่น", gmv: 60000, count: 12 },
      { id: "cat-2", label: "อุปกรณ์ไอที", gmv: 40000, count: 8 },
    ];

    render(<RankingList rows={mockRows} />);

    // Ranks
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Labels
    expect(screen.getByText("เสื้อผ้าแฟชั่น")).toBeInTheDocument();
    expect(screen.getByText("อุปกรณ์ไอที")).toBeInTheDocument();

    // In-bar values and counts
    expect(screen.getByText("฿60,000")).toBeInTheDocument();
    expect(screen.getByText("12 ชิ้น")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();

    expect(screen.getByText("฿40,000")).toBeInTheDocument();
    expect(screen.getByText("8 ชิ้น")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });
});
