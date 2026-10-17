import {
  addDays,
  buildTrendPoints,
  customDayError,
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

describe("the custom day", () => {
  it("is compared with the day before and charted by the hour", () => {
    expect(overviewPeriods("custom", NOW, "2025-10-16")).toEqual({
      current: { from: "2025-10-16", to: "2025-10-17" },
      previous: { from: "2025-10-15", to: "2025-10-16" },
      trend: { from: "2025-10-16", to: "2025-10-17", granularity: "hour" },
    });
  });

  it("is named in the wording", () => {
    expect(describeMode("custom", "2025-10-16")).toMatchObject({
      compareLabel: "เทียบกับวันก่อนหน้า",
      baselineName: "วันก่อนหน้า",
      periodName: "16 ต.ค. 2568",
      inPeriod: "ในวันที่ 16 ต.ค. 2568",
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
    const points = buildTrendPoints("custom", rows, NOW);

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
