"use client";

/**
 * UploadProgressPill
 * Matches the sleek rounded progress bar from the user reference image:
 * - Percentage label (e.g. "27%")
 * - Mint/teal progress bar
 * - Pause / Resume button
 * - Cancel button (soft red circle with X)
 * - Action menu (three dots)
 */
import { getFileTypeConfig } from "../../lib/fileIcons";

export default function UploadProgressPill({
  progress = 0,
  isPaused = false,
  fileName = "",
  onPauseToggle,
  onCancel,
}) {
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const fileConfig = fileName ? getFileTypeConfig(fileName) : null;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-sm transition-all duration-200"
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={fileName ? `กำลังอัปโหลด ${fileName}` : "กำลังอัปโหลดไฟล์"}
    >
      {/* File type icon badge */}
      {fileConfig && (
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${fileConfig.gradient} text-white shadow-2xs`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {fileConfig.icon}
          </span>
        </div>
      )}

      {/* Percentage */}
      <span className="min-w-[42px] font-mono text-sm font-semibold text-slate-500">
        {clampedProgress}%
      </span>

      {/* Progress Track & Bar */}
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-1.5">
        {onPauseToggle && (
          <button
            type="button"
            onClick={onPauseToggle}
            aria-label={isPaused ? "ดำเนินการอัปโหลดต่อ" : "พักการอัปโหลด"}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
          >
            <span
              className="material-symbols-outlined text-[16px]"
              aria-hidden="true"
            >
              {isPaused ? "play_arrow" : "pause"}
            </span>
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="ยกเลิกการอัปโหลด"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 text-rose-500 transition hover:bg-rose-100 hover:text-rose-600"
          >
            <span
              className="material-symbols-outlined text-[15px]"
              aria-hidden="true"
            >
              close
            </span>
          </button>
        )}

        <button
          type="button"
          aria-label="ตัวเลือกเพิ่มเติม"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <span
            className="material-symbols-outlined text-[18px]"
            aria-hidden="true"
          >
            more_vert
          </span>
        </button>
      </div>
    </div>
  );
}
