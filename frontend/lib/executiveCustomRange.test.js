import {
  addDays,
  buildTrendPoints,
  customDayError,
  customTrendGranularity,
  dayRangeError,
  defaultCustomDay,
  describeMode,
  formatDayField,
  maskDayField,
  overviewPeriods,
  parseDayField,
  parseIsoDate,
  thaiDate,
} from "./executive";

// 12:00 Bangkok on 16 October 2026.
const NOW = new Date("2026-10-16T05:00:00.000Z");

describe("date helpers", () => {
  it("parses only real calendar dates", () => {
    expect(parseIsoDate("2025-10-16")).toEqual({
      year: 2025,
      monthIndex: 9,
      day: 16,
    });
    for (const bad of ["", "2025-02-30", "2025-13-01", "16/10/2025", null]) {
      expect(parseIsoDate(bad)).toBeNull();
    }
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2025-10-31", 1)).toBe("2025-11-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });

  it("writes a date in Thai with the Buddhist year", () => {
    expect(thaiDate("2025-10-16")).toBe("16 ต.ค. 2568");
  });

  it("starts on today in Bangkok", () => {
    expect(defaultCustomDay(NOW)).toBe("2026-10-16");
    // 01:00 Bangkok on the 17th is still the 16th in UTC.
    expect(defaultCustomDay(new Date("2026-10-16T18:00:00.000Z"))).toBe(
      "2026-10-17",
    );
  });
});

describe("customDayError", () => {
  it("accepts today and any earlier day", () => {
    expect(customDayError("2026-10-16", NOW)).toBe("");
    expect(customDayError("2020-01-01", NOW)).toBe("");
  });

  it("explains what is wrong", () => {
    expect(customDayError("", NOW)).toMatch(/เลือกวันที่/);
    expect(customDayError("2025-02-30", NOW)).toMatch(/เลือกวันที่/);
    expect(customDayError("2026-10-17", NOW)).toMatch(/อนาคต/);
  });
});

const DAY = { from: "2025-10-16", to: "2025-10-16" };

describe("dayRangeError", () => {
  it("accepts a range of days, one day included", () => {
    expect(dayRangeError({ from: "2026-10-01", to: "2026-10-16" }, NOW)).toBe(
      "",
    );
    expect(dayRangeError(DAY, NOW)).toBe("");
  });

  it("explains what is wrong", () => {
    expect(dayRangeError({ from: "", to: "2026-10-16" }, NOW)).toMatch(
      /เลือกวันที่/,
    );
    expect(
      dayRangeError({ from: "2026-10-16", to: "2026-10-01" }, NOW),
    ).toMatch(/ต้องไม่หลัง/);
    expect(
      dayRangeError({ from: "2026-10-01", to: "2026-10-17" }, NOW),
    ).toMatch(/อนาคต/);
    expect(
      dayRangeError({ from: "2025-01-01", to: "2026-10-16" }, NOW),
    ).toMatch(/ไม่เกิน 366 วัน/);
  });
});

describe("how a custom range is charted", () => {
  const range = (from, to) => ({ from, to });

  it("by the hour for one day, by the day up to 92 days, then by the month", () => {
    expect(customTrendGranularity(DAY)).toBe("hour");
    expect(customTrendGranularity(range("2026-10-01", "2026-10-02"))).toBe(
      "day",
    );
    // 1 July to 30 September is 92 days, the last with a point for every day.
    expect(customTrendGranularity(range("2026-07-01", "2026-09-30"))).toBe(
      "day",
    );
    expect(customTrendGranularity(range("2026-07-01", "2026-10-01"))).toBe(
      "month",
    );
  });
});

describe("the custom range", () => {
  it("is one day: compared with the day before and charted by the hour", () => {
    expect(overviewPeriods("custom", NOW, DAY)).toEqual({
      current: { from: "2025-10-16", to: "2025-10-17" },
      previous: { from: "2025-10-15", to: "2025-10-16" },
      trend: { from: "2025-10-16", to: "2025-10-17", granularity: "hour" },
    });
  });

  it("is compared with the stretch of the same length just before it", () => {
    // 10 days, both ends included: 6 to 15 October.
    expect(
      overviewPeriods("custom", NOW, { from: "2026-10-06", to: "2026-10-15" }),
    ).toEqual({
      current: { from: "2026-10-06", to: "2026-10-16" },
      previous: { from: "2026-09-26", to: "2026-10-06" },
      trend: { from: "2026-10-06", to: "2026-10-16", granularity: "day" },
    });
  });

  it("is named in the wording", () => {
    expect(describeMode("custom", DAY)).toMatchObject({
      compareLabel: "เทียบกับวันก่อนหน้า",
      baselineName: "วันก่อนหน้า",
      periodName: "ช่วงที่เลือก",
    });
    expect(
      describeMode("custom", { from: "2026-10-06", to: "2026-10-15" }),
    ).toMatchObject({
      compareLabel: "เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน",
      periodName: "ช่วงที่เลือก",
      trendCaption: "ยอดรายวัน · 6 ต.ค. 2569 – 15 ต.ค. 2569 (10 วัน)",
    });
  });

  it("leaves the fixed modes as they were", () => {
    expect(describeMode("month").periodName).toBe("เดือนนี้");
  });

  it("has a point every hour, named on the axis every three hours and at the end", () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({
      period: new Date(
        Date.UTC(2025, 9, 15, 17) + i * 3600 * 1000,
      ).toISOString(),
      gmv: i * 10,
      platformRevenue: i,
    }));
    const points = buildTrendPoints("custom", rows, NOW, DAY);

    expect(points).toHaveLength(24);
    expect(points.slice(0, 3).map((p) => p.label)).toEqual([
      "00:00",
      "01:00",
      "02:00",
    ]);
    // 00:00, 03:00 … 21:00, then 23:00 where the day ends.
    expect(points.map((p) => p.axisLabel).filter(Boolean)).toEqual([
      "00:00",
      "03:00",
      "06:00",
      "09:00",
      "12:00",
      "15:00",
      "18:00",
      "21:00",
      "23:00",
    ]);
    expect(points[0].fullLabel).toBe("16 ต.ค. 2568 · 00:00–00:59");
    expect(points[22].fullLabel).toBe("16 ต.ค. 2568 · 22:00–22:59");
    expect(points[23].fullLabel).toBe("16 ต.ค. 2568 · 23:00–23:59");
    expect(points[5].value).toBe(50);
  });

  // Bangkok midnights: the day starting 1 October is 30 September 17:00Z.
  const dayRows = (count, start = Date.UTC(2026, 8, 30, 17)) =>
    Array.from({ length: count }, (_, i) => ({
      period: new Date(start + i * 86400000).toISOString(),
      gmv: (i + 1) * 100,
      platformRevenue: i + 1,
    }));

  it("has a point for every day, so more days means more points", () => {
    const ten = buildTrendPoints("custom", dayRows(10), NOW, {
      from: "2026-10-01",
      to: "2026-10-10",
    });
    const sixty = buildTrendPoints("custom", dayRows(60), NOW, {
      from: "2026-10-01",
      to: "2026-11-29",
    });
    expect(ten).toHaveLength(10);
    expect(sixty).toHaveLength(60);
    expect(ten[0]).toMatchObject({
      label: "1",
      value: 100,
      fullLabel: "1 ต.ค. 2569",
    });
    expect(ten[9].value).toBe(1000);
  });

  it("names about eight days on the axis, always the first and the last", () => {
    const rows = dayRows(60);
    const points = buildTrendPoints("custom", rows, NOW, {
      from: "2026-10-01",
      to: "2026-11-29",
    });
    const named = points.filter((p) => p.axisLabel);
    expect(named.length).toBeLessThanOrEqual(9);
    expect(points[0].axisLabel).toBe("1");
    expect(points[0].subLabel).toBe("ต.ค.");
    expect(points[59].axisLabel).toBe("29");
    expect(points[59].subLabel).toBe("พ.ย.");
    // Every point still reads in full when pointed at.
    expect(points.every((p) => p.fullLabel)).toBe(true);
    // A short range names every day.
    const week = buildTrendPoints("custom", dayRows(7), NOW, {
      from: "2026-10-01",
      to: "2026-10-07",
    });
    expect(week.map((p) => p.axisLabel)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
  });

  it("has a point for every month beyond 92 days, and says which are partial", () => {
    // 10 Aug to 20 Dec 2026: Aug (from the 10th), Sep, Oct, Nov, Dec (to the 20th).
    const months = [
      Date.UTC(2026, 6, 31, 17),
      Date.UTC(2026, 7, 31, 17),
      Date.UTC(2026, 8, 30, 17),
      Date.UTC(2026, 9, 31, 17),
      Date.UTC(2026, 10, 30, 17),
    ];
    const rows = months.map((at, i) => ({
      period: new Date(at).toISOString(),
      gmv: (i + 1) * 1000,
      platformRevenue: i + 1,
    }));
    const range = { from: "2026-08-10", to: "2026-12-20" };
    expect(customTrendGranularity(range)).toBe("month");

    const points = buildTrendPoints("custom", rows, NOW, range);
    expect(points.map((p) => p.label)).toEqual([
      "ส.ค.",
      "ก.ย.",
      "ต.ค.",
      "พ.ย.",
      "ธ.ค.",
    ]);
    expect(points[0].fullLabel).toBe(
      "สิงหาคม 2569 · เฉพาะวันที่อยู่ในช่วงที่เลือก",
    );
    expect(points[2].fullLabel).toBe("ตุลาคม 2569");
    expect(points[4].fullLabel).toBe(
      "ธันวาคม 2569 · เฉพาะวันที่อยู่ในช่วงที่เลือก",
    );
    // The year (Buddhist, two digits) goes under the first month.
    expect(points[0].subLabel).toBe("69");
    expect(points[1].subLabel).toBeUndefined();
  });
});

describe("the day field text", () => {
  it("writes a date as day/month/Buddhist year", () => {
    expect(formatDayField("2026-10-16")).toBe("16/10/2569");
    expect(formatDayField("2025-01-05")).toBe("05/01/2568");
    expect(formatDayField("")).toBe("");
  });

  it("lays typed digits out as dd/mm/yyyy", () => {
    expect(maskDayField("1")).toBe("1");
    expect(maskDayField("161")).toBe("16/1");
    expect(maskDayField("16102569")).toBe("16/10/2569");
    expect(maskDayField("16-10-2569 99")).toBe("16/10/2569");
    expect(maskDayField("abc")).toBe("");
  });

  it("reads a finished, real date back to ISO", () => {
    expect(parseDayField("16/10/2569")).toBe("2026-10-16");
    expect(parseDayField("29/02/2567")).toBe("2024-02-29");
  });

  it("refuses unfinished text and days that do not exist", () => {
    for (const bad of ["", "16/10", "31/02/2569", "29/02/2569", "00/10/2569"]) {
      expect(parseDayField(bad)).toBeNull();
    }
  });
});
