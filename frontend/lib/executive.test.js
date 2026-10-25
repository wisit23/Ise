import {
  buildPath,
  buildSeriesPath,
  buildTrendPoints,
  currentDate,
  currentYearMonth,
  dayLabel,
  growthPct,
  lastNWindows,
  monthLabel,
  monthWindow,
  OVERVIEW_MODES,
  overviewPeriods,
  describeMode,
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

// 12:00 Bangkok on 14 October 2026.
const OCT_14 = new Date("2026-10-14T05:00:00.000Z");

describe("currentDate", () => {
  it("reads the calendar date in the report time zone", () => {
    expect(currentDate(OCT_14)).toEqual({ year: 2026, monthIndex: 9, day: 14 });
    // 01:00 Bangkok on 1 October is still 30 September in UTC.
    expect(currentDate(new Date("2026-09-30T18:00:00.000Z"))).toEqual({
      year: 2026,
      monthIndex: 9,
      day: 1,
    });
  });
});

describe("OVERVIEW_MODES", () => {
  it("offers today, this month, then this year, with today first as the default", () => {
    expect(OVERVIEW_MODES.map((m) => [m.value, m.label])).toEqual([
      ["today", "วันนี้"],
      ["month", "เดือนนี้"],
      ["year", "ปีนี้"],
    ]);
  });

  it("names what each mode is compared with", () => {
    expect(OVERVIEW_MODES.map((m) => m.compareLabel)).toEqual([
      "เทียบกับวันเดียวกันสัปดาห์ที่แล้ว",
      "เทียบกับวันเดียวกันของเดือนที่แล้ว",
      "เทียบกับวันเดือนเดียวกันของปีที่แล้ว",
    ]);
  });
});

describe("overviewPeriods", () => {
  it("compares this month so far with the same days of last month", () => {
    expect(overviewPeriods("month", OCT_14)).toEqual({
      current: { from: "2026-10-01", to: "2026-10-15" },
      previous: { from: "2026-09-01", to: "2026-09-15" },
      trend: { from: "2026-05-01", to: "2026-10-15", granularity: "month" },
    });
  });

  it("compares a long day with a shorter previous month in full", () => {
    const p = overviewPeriods("month", new Date("2026-03-30T05:00:00.000Z"));
    expect(p.current).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(p.previous).toEqual({ from: "2026-02-01", to: "2026-03-01" });
  });

  it("starts the month on Bangkok's first day, not UTC's", () => {
    const p = overviewPeriods("month", new Date("2026-09-30T18:00:00.000Z"));
    expect(p.current).toEqual({ from: "2026-10-01", to: "2026-10-02" });
    expect(p.previous).toEqual({ from: "2026-09-01", to: "2026-09-02" });
  });

  it("compares the year so far with the same month and day last year", () => {
    expect(overviewPeriods("year", OCT_14)).toEqual({
      current: { from: "2026-01-01", to: "2026-10-15" },
      previous: { from: "2025-01-01", to: "2025-10-15" },
      trend: { from: "2022-01-01", to: "2026-10-15", granularity: "month" },
    });
  });

  it("ends the previous year on 28 February when today is a leap day", () => {
    const p = overviewPeriods("year", new Date("2028-02-29T05:00:00.000Z"));
    expect(p.current).toEqual({ from: "2028-01-01", to: "2028-03-01" });
    expect(p.previous).toEqual({ from: "2027-01-01", to: "2027-03-01" });
  });

  it("compares today with the same weekday last week, up to the same time", () => {
    // Wednesday 14 October, 12:00 Bangkok, against Wednesday 7 October up
    // to 12:00 Bangkok.
    expect(overviewPeriods("today", OCT_14)).toEqual({
      current: { from: "2026-10-14", to: "2026-10-15" },
      previous: { from: "2026-10-07", to: "2026-10-07T05:00:00.000Z" },
      trend: { from: "2026-10-14", to: "2026-10-15", granularity: "hour" },
    });
  });

  it("lets last week's day be in the month before", () => {
    const p = overviewPeriods("today", new Date("2026-10-01T05:00:00.000Z"));
    expect(p.current).toEqual({ from: "2026-10-01", to: "2026-10-02" });
    expect(p.previous).toEqual({
      from: "2026-09-24",
      to: "2026-09-24T05:00:00.000Z",
    });
  });

  it("says it is compared with the same day last week", () => {
    expect(describeMode("today")).toMatchObject({
      compareLabel: "เทียบกับวันเดียวกันสัปดาห์ที่แล้ว",
      baselineName: "วันเดียวกันสัปดาห์ที่แล้ว",
      periodName: "วันนี้",
    });
  });

  it("changes day at Bangkok midnight, not UTC's", () => {
    // 01:00 Bangkok on 15 October is still 14 October in UTC.
    const p = overviewPeriods("today", new Date("2026-10-14T18:00:00.000Z"));
    expect(p.current).toEqual({ from: "2026-10-15", to: "2026-10-16" });
  });
});

// A bucket's period is the instant its Bangkok day/month starts (UTC+7).
const bangkokStart = (year, monthIndex, day = 1) =>
  new Date(Date.UTC(year, monthIndex, day) - 7 * 3600 * 1000).toISOString();

describe("buildTrendPoints", () => {
  it("shows six whole months and names the unfinished one", () => {
    const rows = [4, 5, 6, 7, 8, 9].map((m, i) => ({
      period: bangkokStart(2026, m),
      gmv: (i + 1) * 1000,
      platformRevenue: (i + 1) * 30,
      completedOrders: i + 1,
    }));
    const points = buildTrendPoints("month", rows, OCT_14);

    expect(points.map((p) => p.label)).toEqual([
      "พ.ค.",
      "มิ.ย.",
      "ก.ค.",
      "ส.ค.",
      "ก.ย.",
      "ต.ค.",
    ]);
    expect(points.map((p) => p.subLabel)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "(ถึง 14)",
    ]);
    expect(points[0].fullLabel).toBe("พฤษภาคม 2569 · ทั้งเดือน");
    expect(points[5].fullLabel).toBe("ตุลาคม 2569 · ถึงวันที่ 14 ต.ค.");
    expect(points[5].value).toBe(6000);
    expect(points[5].detail).toBe("ยอดขาย ฿6,000 · รายได้แพลตฟอร์ม ฿180");
  });

  function yearRows(perYear) {
    const rows = [];
    for (const [year, gmv] of Object.entries(perYear)) {
      const lastMonth = Number(year) === 2026 ? 9 : 11;
      for (let m = 0; m <= lastMonth; m++) {
        rows.push({
          period: bangkokStart(Number(year), m),
          gmv,
          platformRevenue: gmv * 0.03,
          completedOrders: gmv > 0 ? 1 : 0,
        });
      }
    }
    return rows;
  }

  it("totals each year and drops years before the first sale", () => {
    const points = buildTrendPoints(
      "year",
      yearRows({ 2022: 0, 2023: 0, 2024: 100, 2025: 200, 2026: 300 }),
      OCT_14,
    );

    expect(points.map((p) => p.label)).toEqual(["2567", "2568", "2569"]);
    expect(points.map((p) => p.value)).toEqual([1200, 2400, 3000]);
    expect(points[2].subLabel).toBe("(ถึง 14 ต.ค.)");
    expect(points[2].fullLabel).toBe("ปี 2569 · ถึงวันที่ 14 ต.ค.");
    expect(points[1].fullLabel).toBe("ปี 2568 · ทั้งปี");
    expect(points[1].detail).toBe("ยอดขาย ฿2,400 · รายได้แพลตฟอร์ม ฿72");
  });

  it("keeps a zero year that falls after the first sale", () => {
    const points = buildTrendPoints(
      "year",
      yearRows({ 2022: 100, 2023: 0, 2024: 100, 2025: 100, 2026: 100 }),
      OCT_14,
    );
    expect(points.map((p) => p.label)).toEqual([
      "2565",
      "2566",
      "2567",
      "2568",
      "2569",
    ]);
    expect(points[1].value).toBe(0);
  });

  it("still shows the current year when nothing has sold yet", () => {
    const points = buildTrendPoints(
      "year",
      yearRows({ 2022: 0, 2023: 0, 2024: 0, 2025: 0, 2026: 0 }),
      OCT_14,
    );
    expect(points.map((p) => p.label)).toEqual(["2569"]);
    expect(points[0].value).toBe(0);
  });

  it("charts today by the hour, only up to the hour it is now", () => {
    // All 24 hourly slots of 14 October in Bangkok; it is 12:00 there.
    const rows = Array.from({ length: 24 }, (_, i) => ({
      period: new Date(
        Date.UTC(2026, 9, 13, 17) + i * 3600 * 1000,
      ).toISOString(),
      gmv: (i + 1) * 100,
      platformRevenue: i + 1,
      completedOrders: 1,
    }));
    const points = buildTrendPoints("today", rows, OCT_14);

    // 00:00 to 12:00: the hours still to come are not drawn as zero sales.
    expect(points).toHaveLength(13);
    expect(points[0].label).toBe("00:00");
    expect(points[12].label).toBe("12:00");
    expect(points.map((p) => p.axisLabel).filter(Boolean)).toEqual([
      "00:00",
      "03:00",
      "06:00",
      "09:00",
      "12:00",
    ]);
    expect(points[12].fullLabel).toBe("14 ต.ค. 2569 · 12:00–12:59");
    expect(points[12].detail).toBe("ยอดขาย ฿1,300 · รายได้แพลตฟอร์ม ฿13");
  });
});
