import { lineTickIndices, smoothLinePath } from "./AgentDashboardCharts";

test.each([14, 24, 30])(
  "date labels for %s points keep the last date clear at every chart width",
  (count) => {
    for (const width of [260, 380, 640, 1100]) {
      const indices = lineTickIndices(count, width);
      expect(indices[0]).toBe(0);
      expect(indices.at(-1)).toBe(count - 1);
      for (let i = 1; i < indices.length; i++) {
        const distance =
          ((indices[i] - indices[i - 1]) * (width - 65)) / (count - 1);
        expect(distance).toBeGreaterThanOrEqual(70 - 1e-6);
      }
    }
  },
);

test("empty and single-day axes have no invalid indices", () => {
  expect(lineTickIndices(0, 400)).toEqual([]);
  expect(lineTickIndices(1, 400)).toEqual([0]);
});
test("smooth curve visits every daily value without overshooting peaks or zero baselines", () => {
  const points = [
    { x: 0, y: 100 },
    { x: 10, y: 0 },
    { x: 20, y: 100 },
    { x: 30, y: 100 },
    { x: 40, y: 50 },
    { x: 50, y: 60 },
  ];
  const path = smoothLinePath(points);
  expect(path).toMatch(/^M0,100/);
  const segments = path.split(" C").slice(1);
  expect(segments).toHaveLength(points.length - 1);
  segments.forEach((segment, index) => {
    const values = segment.split(/[ ,]/).map(Number);
    const [a, b] = [points[index].y, points[index + 1].y];
    for (const value of [values[1], values[3]]) {
      expect(value).toBeGreaterThanOrEqual(Math.min(a, b));
      expect(value).toBeLessThanOrEqual(Math.max(a, b));
    }
    expect(values.slice(-2)).toEqual([
      points[index + 1].x,
      points[index + 1].y,
    ]);
  });
});
test("empty and one-point histories do not produce invalid curves", () => {
  expect(smoothLinePath([])).toBe("");
  expect(smoothLinePath([{ x: 8, y: 2 }])).toBe("M8,2");
});
