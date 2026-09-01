"use client";

import { useState } from "react";

/* The "id with a copy button" pattern appeared three times in the disputes
   table with slightly different hover behaviour each time. The copy button
   used to give no feedback at all — you could not tell whether the click had
   registered — so it now flips to a check for a moment. */
export default function CopyableId({
  value,
  display,
  suffix,
  className = "",
  revealOnHover = false,
}) {
  const [copied, setCopied] = useState(false);

  async function copy(e) {
    // The row underneath may be clickable; copying an id is not "open this".
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Clipboard write failed:", err);
    }
  }

  return (
    <span className={`group/id flex items-center ${className}`}>
      {display ?? value}
      {suffix}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "คัดลอกแล้ว" : `คัดลอกรหัส ${value}`}
        title={copied ? "คัดลอกแล้ว" : "คัดลอก"}
        className={`focus-ring ml-1 rounded text-slate-400 transition-all hover:text-emerald-600 ${
          revealOnHover
            ? "opacity-0 group-hover/id:opacity-100 focus-visible:opacity-100"
            : ""
        } ${copied ? "text-emerald-600 opacity-100" : ""}`}
      >
        <span className="material-symbols-outlined align-middle text-[13px]">
          {copied ? "check" : "content_copy"}
        </span>
      </button>
    </span>
  );
}
