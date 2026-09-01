"use client";

const TONES = {
  error: { cls: "border-danger/30 bg-danger-soft text-red-800", icon: "error" },
  warning: {
    cls: "border-warning/30 bg-warning-soft text-amber-900",
    icon: "warning",
  },
  info: { cls: "border-info/30 bg-info-soft text-sky-800", icon: "info" },
  success: {
    cls: "border-success/30 bg-success-soft text-brand-800",
    icon: "check_circle",
  },
};

/* Replaces the bare `{error && <p className="text-sm text-red-600">}` that was
   repeated on nearly every screen — same look everywhere, and errors are
   announced because of role="alert". */
export default function Alert({
  tone = "error",
  title,
  children,
  className = "",
}) {
  const t = TONES[tone] ?? TONES.info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${t.cls} ${className}`}
    >
      <span
        className="material-symbols-outlined shrink-0 text-[20px] leading-none"
        aria-hidden="true"
      >
        {t.icon}
      </span>
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}
