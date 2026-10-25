"use client";

import { useState } from "react";
import { formatReferenceCode, REFERENCE_UNAVAILABLE } from "../../lib/referenceCodes";

export default function ReferenceCode({ value, className = "" }) {
  const code = formatReferenceCode(value);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!code) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-2 ${className}`}
    >
      <span className="select-text break-all font-mono">{code}</span>
      <button
        type="button"
        disabled={code === REFERENCE_UNAVAILABLE}
        className="text-xs underline"
        aria-label={`คัดลอกรหัส ${code}`}
        onClick={copy}
      >
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
      {failed && (
        <span role="status" className="text-xs">
          คัดลอกไม่ได้ กรุณาเลือกรหัสเพื่อคัดลอก
        </span>
      )}
    </span>
  );
}
