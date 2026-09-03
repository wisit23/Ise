"use client";

import Button from "./Button";

/* There was no equivalent of this before: 17 fetches swallowed their error
   with `.catch(() => {})`, so a backend outage rendered as a blank page with
   no explanation and no way to retry. */
export default function ErrorState({
  title = "โหลดข้อมูลไม่สำเร็จ",
  description = "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง",
  detail,
  onRetry,
  className = "",
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-danger/40 bg-danger-soft/40 px-6 py-12 text-center ${className}`}
    >
      <span
        className="material-symbols-outlined text-[40px] leading-none text-danger"
        aria-hidden="true"
      >
        cloud_off
      </span>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {detail && (
        <p className="max-w-sm break-words text-xs text-ink-subtle">{detail}</p>
      )}
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          onClick={onRetry}
          className="mt-2"
        >
          ลองใหม่
        </Button>
      )}
    </div>
  );
}
