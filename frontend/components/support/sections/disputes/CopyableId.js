"use client";

import { useState } from "react";
import { formatReferenceCode, REFERENCE_UNAVAILABLE } from "../../../../lib/referenceCodes";

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
  const code = formatReferenceCode(value);

  async function copy(e) {
    // The row underneath may be clickable; copying an id is not "open this".
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Clipboard write failed:", err);
    }
  }

  return (
    <span className={`group/id flex items-center ${className}`}>
      {display ?? code}
      {suffix}
      <button
        type="button"
        disabled={code === REFERENCE_UNAVAILABLE}
        onClick={copy}
        aria-label={copied ? "คัดลอกแล้ว" : `คัดลอกรหัส ${code}`}
        title={copied ? "คัดลอกแล้ว" : "คัดลอก"}
        className={`focus-ring ml-1 rounded text-slate-500 transition-all hover:text-emerald-600 ${
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
