"use client";

import Field, { fieldClasses, useFieldIds } from "./Field";

export default function Textarea({
  label,
  hint,
  error,
  id,
  required,
  rows = 4,
  className,
  ...props
}) {
  const { fieldId, hintId, errorId } = useFieldIds(id);

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
      <textarea
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={fieldClasses({ error, className })}
        {...props}
      />
    </Field>
  );
}
