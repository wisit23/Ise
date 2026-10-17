"use client";

import RadioSelect from "../../ui/RadioSelect";

/**
 * DropdownFilter Component (Back-office Table Filter)
 * Wraps the unified RadioSelect primitive with backoffice panel defaults.
 */
export default function DropdownFilter({
  id,
  value,
  onChange,
  options = [],
  className = "",
  size = "md",
  align = "auto",
  disabled = false,
}) {
  return (
    <RadioSelect
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      variant="panel"
      size={size}
      align={align}
      className={className}
      disabled={disabled}
    />
  );
}
