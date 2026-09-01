"use client";

import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/* The five dialogs in this app were each hand-rolled, and none of them could
   be closed with Esc or kept focus inside. Everything that behaves like a
   dialog goes through here instead. */
export default function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = "modal-title";
  const descId = "modal-desc";

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      // Focus trap: Tab off either end wraps to the other.
      // Deliberately not filtering on `offsetParent !== null` to test for
      // visibility: the panel sits inside a position:fixed overlay, and every
      // descendant of a fixed ancestor reports offsetParent === null, which
      // would empty this list and disable the trap entirely.
      const items = Array.from(
        panelRef.current.querySelectorAll(FOCUSABLE),
      ).filter((el) => el.getAttribute("aria-hidden") !== "true");
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog so a keyboard user isn't left behind on the
    // page underneath.
    const target =
      panelRef.current?.querySelector(FOCUSABLE) || panelRef.current;
    target?.focus?.();

    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`animate-dropdown-in flex max-h-[90vh] w-full ${SIZES[size] ?? SIZES.md} flex-col overflow-hidden rounded-xl bg-white shadow-xl`}
      >
        {title && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2
                id={titleId}
                className="text-base font-semibold text-gray-900"
              >
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-ink-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="focus-ring -mr-1 -mt-1 rounded-md p-1 text-ink-subtle transition hover:bg-gray-100 hover:text-gray-700"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">
                close
              </span>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
