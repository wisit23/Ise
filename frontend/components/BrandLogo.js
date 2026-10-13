import Link from "next/link";
import styles from "./BrandLogo.module.css";

export default function BrandLogo({
  className = "",
  compact = false,
  inverse = false,
  label = "RE-LOOP หน้าแรก",
}) {
  return (
    <Link
      href="/"
      aria-label={label}
      className={`focus-ring ${styles.logo} ${inverse ? styles.inverse : ""} ${className}`}
    >
      <svg
        width="33"
        height="28"
        viewBox="0 0 36 28"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M19 8c-6-9-17-4-15 5s10 10 15 2l2-3c5-8 15-5 12 4s-13 8-16 1"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
      <span className={compact ? styles.compact : undefined}>RE-LOOP</span>
    </Link>
  );
}
