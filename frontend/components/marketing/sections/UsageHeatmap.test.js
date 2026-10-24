import {
  buildCalendarHeatmap,
  buildHourlyHeatmap,
  buildWeekdayHourHeatmap,
  resolveUsageHeatmapMode,
} from "./UsageHeatmap";

describe("resolveUsageHeatmapMode", () => {
  test.each([
    ["day", "hour"],
    ["week", "weekday-hour"],
    ["month", "day"],
    ["year", "month"],
  ])("maps the %s preset to %s", (preset, expected) => {
    expect(resolveUsageHeatmapMode({ preset })).toBe(expected);
  });

  test.each([
    ["2026-06-01", "2026-06-01", "hour"],
    ["2026-06-01", "2026-06-07", "weekday-hour"],
    ["2026-06-01", "2026-06-08", "day"],
    ["2026-06-01", "2026-07-01", "day"],
    ["2026-06-01", "2026-07-02", "month"],
  ])("selects custom %s through %s as %s", (fromDate, toDate, expected) => {
    expect(
      resolveUsageHeatmapMode({ preset: "custom", fromDate, toDate }),
    ).toBe(expected);
  });
});

describe("buildWeekdayHourHeatmap", () => {
  test("groups exact hourly usage by Bangkok weekday and hour", () => {
    const matrix = buildWeekdayHourHeatmap([
      { hour: "2026-10-12T17:00:00.000Z", usageCount: 3 },
      { hour: "2026-10-13T00:00:00+07:00", usageCount: 4 },
      { hour: "2026-10-18T16:00:00.000Z", usageCount: 2 },
    ]);

    expect(matrix[1][0]).toBe(7);
    expect(matrix[6][23]).toBe(2);
    expect(matrix.flat().reduce((sum, value) => sum + value, 0)).toBe(9);
  });

  test("ignores invalid timestamps and normalizes invalid counts to zero", () => {
    const matrix = buildWeekdayHourHeatmap([
      { hour: "invalid", usageCount: 99 },
      { hour: "2026-10-13T00:00:00+07:00", usageCount: "invalid" },
    ]);

    expect(matrix.flat().every((value) => value === 0)).toBe(true);
  });
});

describe("adaptive heatmap aggregation", () => {
  const usage = [
    { hour: "2026-06-01T00:00:00+07:00", usageCount: 2 },
    { hour: "2026-06-01T01:00:00+07:00", usageCount: 3 },
    { hour: "2026-06-03T01:00:00+07:00", usageCount: 4 },
    { hour: "2026-07-01T01:00:00+07:00", usageCount: 5 },
  ];

  test("aggregates a day into exactly 24 Bangkok-hour buckets", () => {
    const buckets = buildHourlyHeatmap(usage.slice(0, 2));
    expect(buckets).toHaveLength(24);
    expect(buckets[0].value).toBe(2);
    expect(buckets[1].value).toBe(3);
  });

  test("fills every selected date and preserves zero-usage dates", () => {
    const buckets = buildCalendarHeatmap(usage, {
      mode: "day",
      fromDate: "2026-06-01",
      toDate: "2026-06-03",
    });
    expect(buckets.map(({ value }) => value)).toEqual([5, 0, 4]);
  });

  test("aggregates a long range by Gregorian calendar month", () => {
    const buckets = buildCalendarHeatmap(usage, {
      mode: "month",
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });
    expect(buckets).toHaveLength(12);
    expect(buckets[5].value).toBe(9);
    expect(buckets[6].value).toBe(5);
  });
});
