"use client";

import React, { useState, useRef, useEffect, useId } from "react";

/**
 * RadioSelect / Animated Select Component
 *
 * Features:
 * - Smart auto-alignment (detects viewport bounds and aligns right if near the right edge)
 * - Arrow rotates from -90deg (sideways) to 0deg (pointing down) over 300ms
 * - Options panel slides down from behind trigger (-12px -> 0px) with 300ms opacity & transform transition
 * - Generous vertical gap between trigger and options panel (mt-2 / mt-2.5)
 * - Smooth option hover transition (200ms)
 * - Fully dynamic, accessible, and dismissable on outside click.
 *
 * @param {Array<{value: string|number, label: string, icon?: string}>|Array<string>} options - Array of options
 * @param {string|number} value - Currently selected value
 * @param {Function} onChange - Callback (value) => void
 * @param {string} [name] - Radio group name
 * @param {string} [placeholder] - Fallback placeholder text
 * @param {'panel'|'storefront'|'dark'} [variant='panel'] - Theme variant
 * @param {'sm'|'md'|'lg'} [size='md'] - Sizing preset
 * @param {'auto'|'left'|'right'} [align='auto'] - Dropdown alignment (auto flips if near edge)
 * @param {boolean} [hoverToOpen=true] - Whether hovering opens the dropdown
 * @param {string} [className] - Wrapper class
 * @param {string} [buttonClassName] - Trigger button class
 * @param {boolean} [disabled=false] - Disabled state
 */
export default function RadioSelect({
  id,
  options = [],
  value,
  onChange,
  name,
  placeholder = "เลือกรายการ...",
  variant = "panel",
  size = "md",
  align = "auto",
  hoverToOpen = true,
  className = "",
  buttonClassName = "",
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [effectiveAlign, setEffectiveAlign] = useState(
    align === "right" ? "right" : "left",
  );
  const dropdownRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const generatedName = useId();
  const groupName = name || generatedName;

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

  const selectedOption =
    normalizedOptions.find((o) => o.value === value) || normalizedOptions[0];

  const handleSelect = (val) => {
    if (disabled) return;
    if (onChange) onChange(val);
    setIsOpen(false);
  };

  const checkAlignment = () => {
    if (align === "right") {
      setEffectiveAlign("right");
      return;
    }
    if (align === "left") {
      setEffectiveAlign("left");
      return;
    }
    // "auto" detection
    if (dropdownRef.current && typeof window !== "undefined") {
      const rect = dropdownRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      // If dropdown button's right side is close to viewport right edge (less than 190px space), align right
      if (viewportWidth - rect.left < 210 || rect.right > viewportWidth - 30) {
        setEffectiveAlign("right");
      } else {
        setEffectiveAlign("left");
      }
    }
  };

  const handleMouseEnter = () => {
    if (disabled || !hoverToOpen) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    checkAlignment();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (disabled || !hoverToOpen) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handleClick = () => {
    if (disabled) return;
    checkAlignment();
    setIsOpen((prev) => !prev);
  };

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Variant themes
  const variantStyles =
    {
      form: {
        trigger:
          "border border-gray-300 bg-white text-gray-900 text-sm shadow-sm hover:border-gray-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20",
        menu: "border border-gray-200 bg-white shadow-lg",
        activeOption: "bg-emerald-50 text-emerald-700 font-semibold",
        inactiveOption:
          "text-gray-700 hover:bg-gray-50 hover:text-gray-900 font-medium",
        arrow: "text-gray-400",
      },
      panel: {
        trigger:
          "border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50/80 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20",
        menu: "border border-slate-200 bg-white shadow-[0_10px_25px_-5px_rgba(15,23,42,0.12)]",
        activeOption: "bg-emerald-50 text-emerald-700 font-semibold",
        inactiveOption:
          "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium",
        arrow: "text-slate-500",
      },
      storefront: {
        trigger:
          "border border-line bg-white text-ink shadow-sm hover:border-brand-400 hover:bg-surface-subtle focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20",
        menu: "border border-line bg-white shadow-2",
        activeOption: "bg-brand-50 text-brand-700 font-semibold",
        inactiveOption:
          "text-ink-muted hover:bg-surface-subtle hover:text-ink font-medium",
        arrow: "text-ink-subtle",
      },
      dark: {
        trigger:
          "border border-[#3B4252] bg-[#2A2F3B] text-white shadow-sm hover:bg-[#323741] focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-white/20",
        menu: "border border-[#3B4252] bg-[#2A2F3B] shadow-2xl",
        activeOption: "bg-[#384152] text-white font-semibold",
        inactiveOption:
          "text-slate-300 hover:bg-[#323741] hover:text-white font-medium",
        arrow: "text-white",
      },
    }[variant] || variantStyles.form;

  // Size styles
  const sizeStyles =
    {
      sm: {
        trigger: "py-1.5 px-3 text-xs min-h-[34px] rounded-md",
        menu: "p-1 rounded-lg text-xs mt-1.5",
        option: "px-2.5 py-1.5 rounded-md text-xs gap-2",
        arrow: "w-3.5 h-3.5",
      },
      md: {
        trigger: "py-2 px-3 text-sm min-h-[38px] rounded-md",
        menu: "p-1.5 rounded-lg text-sm mt-1.5",
        option: "px-3 py-2 rounded-md text-sm gap-2.5",
        arrow: "w-4 h-4",
      },
      lg: {
        trigger: "py-2.5 px-4 text-sm font-medium min-h-[44px] rounded-md",
        menu: "p-1.5 rounded-lg text-sm mt-2",
        option: "px-3.5 py-2.5 rounded-md text-sm gap-3",
        arrow: "w-4.5 h-4.5",
      },
    }[size] || sizeStyles.md;

  const containerClass =
    className.includes("w-") ||
    className.includes("block") ||
    className.includes("flex-1")
      ? `relative ${className}`
      : `relative inline-block ${className}`;

  return (
    <div
      className={containerClass}
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Hidden native select for standard HTML form submission & test compatibility */}
      {id && (
        <select
          id={id}
          name={groupName}
          value={value}
          onChange={(e) => handleSelect(e.target.value)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        >
          {normalizedOptions.map((opt) => (
            <option key={String(opt.value)} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {/* Trigger Box (.selected) */}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between gap-2.5 outline-none transition-all duration-300 ${variantStyles.trigger} ${sizeStyles.trigger} ${buttonClassName} ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon && (
            <span className="material-symbols-outlined text-[17px] shrink-0 leading-none">
              {selectedOption.icon}
            </span>
          )}
          <span className="truncate">
            {selectedOption?.label || placeholder}
          </span>
        </span>

        {/* Arrow SVG from the user's snippet: rotates from -90deg to 0deg over 300ms */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          aria-hidden="true"
          className={`shrink-0 fill-current transition-transform duration-300 ease-out ${
            variantStyles.arrow
          } ${sizeStyles.arrow}`}
          style={{
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        >
          <path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z" />
        </svg>
      </button>

      {/* Options Panel (.options): smart positioning (right-0 if near edge, left-0 otherwise) */}
      <div
        role="listbox"
        tabIndex={-1}
        className={`absolute top-full z-50 min-w-[170px] w-full max-w-[calc(100vw-32px)] transition-all duration-300 ease-out ${
          variantStyles.menu
        } ${sizeStyles.menu} ${
          effectiveAlign === "right" ? "right-0 left-auto" : "left-0 right-auto"
        } ${
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto visible"
            : "opacity-0 -translate-y-3 pointer-events-none invisible"
        }`}
        style={{
          transformOrigin:
            effectiveAlign === "right" ? "top right" : "top left",
        }}
      >
        <div className="flex flex-col gap-0.5">
          {normalizedOptions.map((opt) => {
            const isSelected = opt.value === value;
            const optionId = `${groupName}-${String(opt.value)}`;

            return (
              <label
                key={String(opt.value)}
                htmlFor={optionId}
                onClick={() => handleSelect(opt.value)}
                className={`group/opt flex items-center justify-between cursor-pointer transition-colors duration-200 select-none ${
                  sizeStyles.option
                } ${isSelected ? variantStyles.activeOption : variantStyles.inactiveOption}`}
              >
                {/* Hidden accessible Radio input */}
                <input
                  type="radio"
                  id={optionId}
                  name={groupName}
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => handleSelect(opt.value)}
                  className="sr-only"
                />

                <div className="flex items-center gap-2 min-w-0">
                  {opt.icon && (
                    <span
                      className={`material-symbols-outlined text-[17px] shrink-0 leading-none ${
                        isSelected
                          ? "text-current"
                          : "text-slate-400 group-hover/opt:text-slate-600"
                      }`}
                    >
                      {opt.icon}
                    </span>
                  )}
                  <span className="truncate">{opt.label}</span>
                </div>

                {/* Active checkmark indicator */}
                {isSelected ? (
                  <span className="material-symbols-outlined text-[15px] leading-none shrink-0 ml-1.5 font-bold">
                    check
                  </span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-transparent group-hover/opt:bg-slate-300 transition-colors shrink-0 ml-1.5" />
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
