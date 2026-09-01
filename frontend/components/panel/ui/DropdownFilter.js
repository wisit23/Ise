"use client";
import { useState, useRef, useEffect } from "react";

export default function DropdownFilter({ value, onChange, options }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dropdownRef = useRef(null);

  const closeDropdown = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 140);
  };

  const toggleDropdown = () => {
    if (isOpen) {
      closeDropdown();
    } else {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen((prev) => {
          if (prev) {
            setIsClosing(true);
            setTimeout(() => {
              setIsOpen(false);
              setIsClosing(false);
            }, 140);
          }
          return prev;
        });
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel =
    options.find((o) => o.value === value)?.label || options[0]?.label;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggleDropdown}
        className="flex h-full w-full items-center justify-between min-w-[140px] rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2 text-sm font-medium text-slate-700 shadow-sm outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 hover:border-slate-300"
      >
        <span className="truncate mr-2">{selectedLabel}</span>
        <span className="material-symbols-outlined shrink-0 text-[18px] text-slate-500">
          expand_more
        </span>
      </button>
      {(isOpen || isClosing) && (
        <div
          className={`absolute top-full left-0 mt-2 w-full min-w-[160px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-dropdown ${isClosing ? "animate-dropdown-out" : "animate-dropdown-in"}`}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                closeDropdown();
              }}
              className={`w-full text-left rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                value === o.value
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
