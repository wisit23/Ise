import { render, screen } from "@testing-library/react";
import CategoryDonut, {
  buildCategorySlices,
  COLLAPSED_SLICES,
  EXPANDED_SLICES,
  OTHER_LABEL,
} from "./CategoryDonut";

const row = (id, gmv) => ({ id, label: id, count: 1, gmv });

describe("buildCategorySlices", () => {
  it("keeps every category when there are few", () => {
    const { slices, whole } = buildCategorySlices(
      [row("bags", 600), row("shoes", 400)],
      { gmv: 1000, count: 2 },
    );
    expect(slices.map((s) => s.label)).toEqual(["bags", "shoes"]);
    expect(whole).toBe(1000);
  });

  it("folds categories past the top five into one 'other' slice", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`c${i}`, 100 - i));
    const { slices } = buildCategorySlices(rows, null);

    expect(slices).toHaveLength(COLLAPSED_SLICES + 1);
    const other = slices.at(-1);
    expect(other.label).toBe(OTHER_LABEL);
    expect(other.gmv).toBe(95 + 94 + 93 + 92 + 91);
  });

  it("names ten categories when expanded and folds only the rest", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`c${i}`, 100 - i));
    const { slices } = buildCategorySlices(rows, null, EXPANDED_SLICES);

    expect(slices).toHaveLength(EXPANDED_SLICES + 1);
    expect(slices.slice(0, 10).map((s) => s.label)).toEqual(
      rows.slice(0, 10).map((r) => r.label),
    );
    expect(slices.at(-1)).toMatchObject({ label: OTHER_LABEL, gmv: 90 + 89 });
  });

  it("has no 'other' slice when ten or fewer categories exist", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`c${i}`, 100 - i));
    const { slices } = buildCategorySlices(rows, null, EXPANDED_SLICES);
    expect(slices).toHaveLength(10);
    expect(slices.some((s) => s.label === OTHER_LABEL)).toBe(false);
  });

  it("counts sales outside the ranked rows as 'other', using the total", () => {
    const { slices, whole } = buildCategorySlices([row("bags", 600)], {
      gmv: 1000,
      count: 5,
    });
    expect(whole).toBe(1000);
    expect(slices.at(-1)).toMatchObject({ label: OTHER_LABEL, gmv: 400 });
  });

  it("gives every slice its own colour, even with ten categories and 'other'", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`c${i}`, 100 - i));
    const colors = buildCategorySlices(rows, null, EXPANDED_SLICES).slices.map(
      (s) => s.color,
    );
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("CategoryDonut", () => {
  it("lists each category with its amount and share", () => {
    render(
      <CategoryDonut
        rows={[row("กระเป๋า", 750), row("รองเท้า", 250)]}
        total={{ gmv: 1000, count: 2 }}
      />,
    );

    expect(screen.getByText("กระเป๋า")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("฿250")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /ยอดขายตามหมวดหมู่ รวม ฿1,000/ }),
    ).toBeInTheDocument();
  });

  it("names a sale with no known category itself", () => {
    render(
      <CategoryDonut
        rows={[{ id: "__uncategorized__", label: null, count: 1, gmv: 300 }]}
        total={{ count: 1, gmv: 300 }}
      />,
    );
    expect(screen.getByText("ไม่ระบุหมวดหมู่")).toBeVisible();
  });

  it("says unavailable, not empty, when the service did not answer", () => {
    render(<CategoryDonut rows={null} />);
    expect(screen.getByText("ไม่พร้อมใช้งาน")).toBeInTheDocument();
  });

  it("says nothing has sold when there are no categories", () => {
    render(<CategoryDonut rows={[]} total={{ gmv: 0, count: 0 }} />);
    expect(
      screen.getByText("ยังไม่มีสินค้าที่ขายได้ในช่วงนี้"),
    ).toBeInTheDocument();
  });
});
