import { SEQUENTIAL_BLUE } from "./palette";

/** 12-point trend line for a stat tile. No axes/tooltip — decorative context
 * for the headline number, not a chart in its own right (see marks-and-anatomy). */
export default function Sparkline({ values, width = 96, height = 28 }) {
  if (!values || values.length < 2) return null;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        stroke={SEQUENTIAL_BLUE}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
