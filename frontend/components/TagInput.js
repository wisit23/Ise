"use client";

import { useState } from "react";

export default function TagInput({ value = [], onChange, placeholder }) {
  const safeValue = Array.isArray(value) ? value : [];
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const tag = draft.trim().replace(/^#/, "");
    if (!tag) return;
    if (!safeValue.includes(tag)) onChange([...safeValue, tag]);
    setDraft("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && !draft && safeValue.length > 0) {
      onChange(safeValue.slice(0, -1));
    }
  }

  function removeTag(tag) {
    onChange(safeValue.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap gap-2 rounded-md border border-gray-300 px-3 py-2 focus-within:border-emerald-500">
      {safeValue.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700"
        >
          #{tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`ลบแท็ก ${tag}`}
            className="text-emerald-500 hover:text-emerald-800"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={safeValue.length === 0 ? placeholder : ""}
        className="min-w-[8rem] flex-1 border-none text-sm outline-none"
      />
    </div>
  );
}
