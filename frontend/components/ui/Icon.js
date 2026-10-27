/** Decorative Material Symbols icon; the adjacent text supplies its meaning. */
export default function Icon({ name, filled = false, className = "", style }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: "1em", lineHeight: 1, verticalAlign: "-0.125em", fontVariationSettings: `'FILL' ${filled ? 1 : 0}`, ...style }}
    >
      {name}
    </span>
  );
}
