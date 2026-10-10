"use client";

import { useCallback, useEffect, useRef, useId, useState } from "react";
import { createPortal } from "react-dom";

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
  placement = "center",
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useId();
  const descId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (!open || !mounted) return;

    previouslyFocused.current = document.activeElement;
    const inertSiblings = [];
    let ancestor = panelRef.current?.parentElement;
    while (ancestor && ancestor !== document.body) {
      for (const sibling of ancestor.parentElement?.children || []) {
        if (sibling !== ancestor && !sibling.inert) {
          sibling.inert = true;
          inertSiblings.push(sibling);
        }
      }
      ancestor = ancestor.parentElement;
    }
    const { overflow } = document.body.style;
    const root = document.documentElement;
    const rootOverflow = root.style.overflow;
    const rootGutter = root.style.scrollbarGutter;
    document.body.style.overflow = "hidden";
    // The site's stable scrollbar gutter leaves an uncovered strip even with
    // a fixed backdrop. Release it while the dialog owns the viewport.
    root.style.overflow = "hidden";
    root.style.scrollbarGutter = "auto";

    // Move focus into the dialog so a keyboard user isn't left behind on the
    // page underneath.
    const target =
      panelRef.current?.querySelector(FOCUSABLE) || panelRef.current;
    target?.focus?.();

    return () => {
      document.body.style.overflow = overflow;
      root.style.overflow = rootOverflow;
      root.style.scrollbarGutter = rootGutter;
      inertSiblings.forEach((sibling) => {
        sibling.inert = false;
      });
      previouslyFocused.current?.focus?.();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  // Animated/transformed workspace ancestors create a containing block for
  // fixed children. Mount at body so the backdrop and panel use the viewport.
  return createPortal(
    <div
      className={`animate-fade-in fixed inset-0 z-modal flex w-screen bg-gray-900/50 ${placement === "drawer" ? "items-stretch justify-end" : "items-center justify-center p-4"}`}
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
        className={
          placement === "drawer"
            ? "animate-slide-in-right flex h-full w-full max-w-[420px] flex-col overflow-hidden bg-white shadow-xl"
            : `animate-dropdown-in flex max-h-[90vh] w-full ${SIZES[size] ?? SIZES.md} flex-col overflow-hidden rounded-xl bg-white shadow-xl`
        }
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
    </div>,
    document.body,
  );
}
