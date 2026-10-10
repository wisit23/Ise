import { smoothLinePath } from "./AgentDashboardCharts";
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
