"use client";

import Field, { fieldClasses, useFieldIds } from "./Field";

export default function Input({
  label,
  hint,
  error,
  icon,
  id,
  required,
  className,
  ...props
}) {
  const { fieldId, hintId, errorId } = useFieldIds(id);

  const input = (
    <input
      id={fieldId}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : hint ? hintId : undefined}
      className={fieldClasses({ error, className: icon ? "pl-10" : className })}
      {...props}
    />
  );

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      fieldId={fieldId}
      hintId={hintId}
      errorId={errorId}
    >
      {icon ? (
        <div className="relative">
          <span
            className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-ink-subtle"
            aria-hidden="true"
          >
            {icon}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
    </Field>
  );
}
