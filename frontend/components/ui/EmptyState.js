"use client";

/* An empty result used to be one grey sentence with no way forward. Every
   empty view should say what happened and offer the next action. */
export default function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-subtle px-6 py-12 text-center ${className}`}
    >
      <span
        className="material-symbols-outlined text-[40px] leading-none text-ink-subtle"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
