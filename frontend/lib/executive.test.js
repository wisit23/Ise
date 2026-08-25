import { dayLabel, monthLabel, growthPct } from "./executive";

describe("dayLabel", () => {
  it("formats as DD/short-month/2-digit-Buddhist-year", () => {
    expect(dayLabel("2026-08-01T00:00:00.000Z")).toBe("01/ส.ค./69");
  });

  it("does not leak the พ.ศ. era prefix that a year-only format would add", () => {
    expect(dayLabel("2026-08-25T00:00:00.000Z")).not.toContain("พ.ศ.");
  });

  it("pads single-digit days", () => {
    expect(dayLabel("2026-01-05T00:00:00.000Z")).toBe("05/ม.ค./69");
  });
});

describe("monthLabel", () => {
  it("returns the full Thai month name for the bucket's month", () => {
    expect(monthLabel("2026-01-01T00:00:00.000Z")).toBe("มกราคม");
    expect(monthLabel("2026-12-01T00:00:00.000Z")).toBe("ธันวาคม");
  });
});

describe("growthPct", () => {
  it("returns null instead of 100% when the baseline is zero", () => {
    expect(growthPct(50, 0)).toBeNull();
  });

  it("computes a rounded percent change", () => {
    expect(growthPct(150, 100)).toBe(50);
  });
});
