"use client";

import React from "react";
import Field, { useFieldIds } from "./Field";
import RadioSelect from "./RadioSelect";

/**
 * Enhanced Select Component
 *
 * Uses the animated RadioSelect dropdown with 300ms rotating arrow,
 * slide-down transitions, and proper styling, wrapped within the accessible
 * Field component (label, hint, error, required).
 *
 * Accepts either plain string arrays `['A', 'B']` or object arrays `[{ value, label, icon }]`.
 */
export default function Select({
  label,
  hint,
  error,
  id,
  required,
  options = [],
  placeholder = "เลือกรายการ...",
  value,
  onChange,
  name,
  disabled = false,
  variant = "form",
  size = "md",
  className = "",
  buttonClassName = "",
}) {
  const { fieldId, hintId, errorId } = useFieldIds(id);

  // Normalize options to [{ value, label, icon }]
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === "object" && opt !== null) {
      return {
        value: opt.value,
        label: opt.label ?? String(opt.value),
        icon: opt.icon,
      };
    }
    return {
      value: opt,
      label: String(opt),
    };
  });

  const handleChange = (val) => {
    if (disabled || !onChange) return;
    // Support both direct value callbacks and standard synthetic form events
    try {
      onChange({
        target: {
          name: name || fieldId,
          value: val,
        },
      });
    } catch {
      onChange(val);
    }
  };

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
      <RadioSelect
        id={fieldId}
        options={normalizedOptions}
        value={value}
        onChange={handleChange}
        name={name || fieldId}
        placeholder={placeholder}
        variant={variant}
        size={size}
        disabled={disabled}
        className={`w-full block ${className}`}
        buttonClassName={`w-full text-left justify-between ${
          error ? "border-danger ring-1 ring-danger/30" : ""
        } ${buttonClassName}`}
      />
    </Field>
  );
}
