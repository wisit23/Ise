"use client";

import { useId, useRef, useState } from "react";
import {
  formatDayField,
  maskDayField,
  parseDayField,
} from "../../lib/executive";

/**
 * A day field written day/month/year (Buddhist year), 16/10/2569, with a
 * calendar to pick from. The browser's own date input follows the browser's
 * language and shows month first, so the typed text is ours and the native
 * calendar is only opened from the button.
 *
 * `value` and `onChange` use "YYYY-MM-DD"; `onChange("")` means the text is
 * not a finished, real date yet. Typing never blanks the page: the caller
 * keeps its last good day.
 */
export default function DayField({
  value,
  onChange,
  max,
  label,
  error,
  caption = "วันที่",
}) {
  const inputId = useId();
  const [text, setText] = useState(() => formatDayField(value));
  const [lastValue, setLastValue] = useState(value);
  const picker = useRef(null);

  // A day chosen in the calendar (or set from outside) replaces the text.
  if (value !== lastValue) {
    setLastValue(value);
    if (value && parseDayField(text) !== value) setText(formatDayField(value));
  }

  function type(raw) {
    const masked = maskDayField(raw);
    setText(masked);
    const iso = parseDayField(masked);
    setLastValue(iso || "");
    onChange(iso || "");
  }

  function openCalendar() {
    const input = picker.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  }

  // An unfinished date is not an error yet; a finished one that is not
  // allowed (in the future, not a real day) is.
  const message = text.length === 10 ? error : "";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 text-sm text-slate-600">
        <label htmlFor={inputId}>{caption}</label>
        <div className="relative">
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={label}
            aria-invalid={Boolean(message)}
            placeholder="วว/ดด/ปปปป"
            maxLength={10}
            className="w-[8.5rem] rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-8 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            value={text}
            onChange={(e) => type(e.target.value)}
          />
          <button
            type="button"
            aria-label="เปิดปฏิทิน"
            onClick={openCalendar}
            className="absolute inset-y-0 right-1 my-auto flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px]"
            >
              calendar_month
            </span>
          </button>
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
            value={value || ""}
            max={max}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          />
        </div>
      </div>
      {message && (
        <p role="alert" className="text-xs text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}
