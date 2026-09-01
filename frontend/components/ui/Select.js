"use client";

import Field, { fieldClasses, useFieldIds } from "./Field";

/* `options` accepts either strings or { value, label } objects so it drops
   into both the catalog screens (plain string lists) and the back office
   (labelled status codes). */
export default function Select({
  label,
  hint,
  error,
  id,
  required,
  options = [],
  placeholder,
  className,
  children,
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
      <select
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={fieldClasses({ error, className })}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => {
          const value = typeof opt === "string" ? opt : opt.value;
          const text = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
        {children}
      </select>
    </Field>
  );
}
