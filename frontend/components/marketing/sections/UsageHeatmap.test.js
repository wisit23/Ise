import { buildWeekdayHourHeatmap } from "./UsageHeatmap";

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
