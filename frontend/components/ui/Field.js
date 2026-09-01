"use client";

import { useId } from "react";

/* Shared label/hint/error scaffolding for Input, Select and Textarea. Wiring
   aria-describedby and aria-invalid by hand at 54 call sites is how form
   errors end up invisible to screen readers, so it happens once, here. */
export function useFieldIds(id) {
  const generated = useId();
  const fieldId = id || generated;
  return {
    fieldId,
    hintId: `${fieldId}-hint`,
    errorId: `${fieldId}-error`,
  };
}

export function fieldClasses({ error, className = "" }) {
  return [
    "focus-ring w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 transition placeholder:text-ink-subtle",
    error
      ? "border-danger focus-visible:ring-danger/50"
      : "border-line-strong hover:border-gray-400 focus-visible:border-brand-500",
    "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-ink-subtle",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Field({
  label,
  hint,
  error,
  required,
  fieldId,
  hintId,
  errorId,
  children,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-gray-700">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
