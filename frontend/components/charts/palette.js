// Validated default palette (dataviz skill, references/palette.md). Fixed
// hue order — never cycle/reassign per-render, and never generate a 9th hue.
export const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

// Lighter tints of the first two hues. Only the expanded ten-category view
// goes past eight series; these are tints, not a ninth hue, and every slice
// is also listed with its name and amount, so colour never carries the data.
export const CATEGORICAL_TINTS = [
  "#8fb9ec", // light blue
  "#f5b295", // light orange
];

export const SEQUENTIAL_BLUE = "#2a78d6";

export const CHART_INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  surface: "#fcfcfb",
};

// Neutrals the Executive charts draw with (axis lines, track, labels, the
// default series colour), named once so a restyle is one edit.
export const CHART_COLORS = {
  // The brand green (brand-600 in tailwind.config / globals.css), as a hex
  // because SVG attributes cannot read CSS variables.
  series: "#059669",
  track: "#f1f5f9",
  axisLine: "#e2e8f0",
  axisText: "#94a3b8",
  label: "#64748b",
  labelActive: "#0f172a",
  unavailable: "#94a3b8",
  pointFill: "#ffffff",
};
