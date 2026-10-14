import {
  buildPath,
  buildSeriesPath,
  currentYearMonth,
  dayLabel,
  growthPct,
  lastNWindows,
  monthLabel,
  monthWindow,
  yearWindow,
} from "./executive";

// Period values are the instants at which a Bangkok (UTC+7) day/month
// begins, i.e. 17:00 UTC on the previous calendar day.
describe("dayLabel", () => {
  it("formats as DD/short-month/2-digit-Buddhist-year", () => {
    expect(dayLabel("2026-07-31T17:00:00.000Z")).toBe("01/ส.ค./69");
  });

  it("does not leak the พ.ศ. era prefix that a year-only format would add", () => {
    expect(dayLabel("2026-08-24T17:00:00.000Z")).not.toContain("พ.ศ.");
  });

  it("pads single-digit days", () => {
    expect(dayLabel("2026-01-04T17:00:00.000Z")).toBe("05/ม.ค./69");
  });

  it("labels a Bangkok day by its Bangkok date, not its UTC date", () => {
    expect(dayLabel("2026-09-30T17:00:00.000Z")).toBe("01/ต.ค./69");
  });
});

describe("monthLabel", () => {
  it("returns the full Thai month name for the bucket's Bangkok month", () => {
    expect(monthLabel("2025-12-31T17:00:00.000Z")).toBe("มกราคม");
    expect(monthLabel("2026-11-30T17:00:00.000Z")).toBe("ธันวาคม");
  });
});

describe("currentYearMonth", () => {
  it("switches month at Bangkok midnight, not UTC midnight", () => {
    // 01:00 Bangkok on 1 October is still 30 September in UTC.
    expect(currentYearMonth(new Date("2026-09-30T18:00:00.000Z"))).toEqual({
      year: 2026,
      monthIndex: 9,
    });
    expect(currentYearMonth(new Date("2026-09-30T16:59:59.000Z"))).toEqual({
      year: 2026,
      monthIndex: 8,
    });
  });
});

describe("report windows", () => {
  it("expresses a month as local calendar dates", () => {
    expect(monthWindow(2026, 9)).toMatchObject({
      from: "2026-10-01",
      to: "2026-11-01",
      longLabel: "ตุลาคม 2569",
    });
  });

  it("rolls month indexes across year boundaries", () => {
    expect(monthWindow(2026, -1)).toMatchObject({
      from: "2025-12-01",
      to: "2026-01-01",
      longLabel: "ธันวาคม 2568",
    });
    expect(monthWindow(2026, 11).to).toBe("2027-01-01");
  });

  it("expresses a year as local calendar dates", () => {
    expect(yearWindow(2026)).toMatchObject({
      from: "2026-01-01",
      to: "2027-01-01",
    });
  });

  it("ends the last N months with the current Bangkok month", () => {
    const windows = lastNWindows(
      "month",
      3,
      new Date("2026-09-30T18:00:00.000Z"),
    );
    expect(windows.map((w) => w.from)).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
  });

  it("sends date-only bounds with the report time zone", () => {
    const win = monthWindow(2026, 9);
    expect(buildPath("/api/x", win)).toBe(
      "/api/x?from=2026-10-01&to=2026-11-01&timezone=Asia%2FBangkok",
    );
    expect(buildSeriesPath("/api/x", win, "day")).toBe(
      "/api/x?from=2026-10-01&to=2026-11-01&granularity=day&timezone=Asia%2FBangkok",
    );
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
