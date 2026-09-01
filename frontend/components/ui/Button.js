"use client";

import Link from "next/link";

/* Before this existed the same emerald CTA was hand-written across 37 files
   with ten different padding combinations. Every button in the app should
   come from here so size and weight stay comparable across screens. */

const VARIANTS = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:hover:bg-brand-600",
  secondary:
    "border border-line-strong bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-brand-700",
  danger: "bg-danger text-white hover:bg-red-700 active:bg-red-800",
};

const SIZES = {
  sm: "gap-1.5 px-3 py-1.5 text-xs",
  md: "gap-2 px-4 py-2 text-sm",
  lg: "gap-2 px-6 py-3 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  href,
  className = "",
  children,
  ...props
}) {
  const isDisabled = disabled || loading;

  const classes = [
    "focus-ring inline-flex items-center justify-center rounded-md font-medium transition",
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    isDisabled ? "cursor-not-allowed opacity-60" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {loading ? (
        <Spinner />
      ) : (
        icon && (
          <span
            className="material-symbols-outlined text-[18px] leading-none"
            aria-hidden="true"
          >
            {icon}
          </span>
        )
      )}
      {children}
    </>
  );

  // A disabled link is still clickable, so fall back to a real disabled
  // button rather than rendering an anchor nobody can turn off.
  if (href && !isDisabled) {
    return (
      <Link href={href} className={classes} {...props}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={props.type || "button"}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {content}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}
