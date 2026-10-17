"use client";

import Button from "../../ui/Button";

/**
 * Standard pagination controls for Marketing list tables and panels.
 * Renders consistent total items count, current page / total pages, and prev/next action buttons.
 */
export default function MarketingPagination({
  page = 1,
  totalPages = 1,
  total = 0,
  loading = false,
  error = null,
  disabled = false,
  onPageChange,
  className = "",
}) {
  const isError = Boolean(error);
  const safeTotalPages = isError ? 1 : Math.max(1, totalPages);
  const safePage = isError ? 1 : Math.min(safeTotalPages, Math.max(1, page));
  const isPrevDisabled = isError || loading || disabled || safePage <= 1;
  const isNextDisabled = isError || loading || disabled || safePage >= safeTotalPages;

  const displayTotal = isError ? "—" : total;
  const displayPage = isError ? "—" : safePage;
  const displayTotalPages = isError ? "—" : safeTotalPages;

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-600 ${className}`}
    >
      <div>
        <span>
          ทั้งหมด <span className="font-semibold">{displayTotal}</span> รายการ
        </span>
        <span className="mx-2">·</span>
        <span>
          หน้า <span className="font-semibold">{displayPage}</span> จาก{" "}
          <span className="font-semibold">{displayTotalPages}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="!px-2.5 !py-1 !text-xs"
          disabled={isPrevDisabled}
          onClick={() => {
            if (isPrevDisabled) return;
            onPageChange && onPageChange(Math.max(1, safePage - 1));
          }}
        >
          ก่อนหน้า
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="!px-2.5 !py-1 !text-xs"
          disabled={isNextDisabled}
          onClick={() => {
            if (isNextDisabled) return;
            onPageChange && onPageChange(Math.min(safeTotalPages, safePage + 1));
          }}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}
