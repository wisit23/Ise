"use client";

import { useCallback, useRef, useState } from "react";
import useDismissable from "../../lib/useDismissable";

/* A trigger plus a panel that drops down from it.
 *
 * The header needed a second one of these the moment the catalogue moved
 * into the top bar, so the open/close state, the dismiss behaviour, the
 * ARIA wiring and the drop-in animation live here once instead of being
 * re-typed per menu.
 *
 * Children are a render prop receiving `close`, so a link inside the panel
 * can dismiss it on the way out without reaching for the parent's state.
 */
export default function Menu({
  label,
  icon,
  labelClassName = "",
  triggerClassName = "",
  align = "left",
  width = 260,
  children,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(ref, open, close);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={
          triggerClassName ||
          "focus-ring flex items-center gap-[.4rem] rounded-sm px-[.7em] py-[.55em] text-sm font-medium text-ink-muted transition hover:bg-surface-panel hover:text-ink lg:px-[.9em]"
        }
      >
        {icon && (
          <span
            className="material-symbols-outlined text-[18px] leading-none"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <span className={labelClassName}>{label}</span>
        <span
          className={`material-symbols-outlined text-[18px] leading-none transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open && (
        <div
          style={{ width }}
          className={`animate-dropdown-in absolute origin-top top-[calc(100%+.5rem)] z-dropdown max-w-[min(90vw,340px)] overflow-hidden rounded-md border border-line bg-white p-1.5 shadow-3 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

/** One row inside a Menu panel — same target size and hover in every menu. */
export function MenuItem({ href, icon, children, onClick, meta }) {
  const className =
    "focus-ring flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-surface-subtle hover:text-ink";
  const body = (
    <>
      {icon && (
        <span
          className="material-symbols-outlined shrink-0 text-[18px] leading-none text-ink-subtle"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta != null && (
        <span className="shrink-0 text-xs text-ink-subtle">{meta}</span>
      )}
    </>
  );
  return href ? (
    <a href={href} onClick={onClick} className={className}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/** Section label inside a Menu panel. */
export function MenuLabel({ children }) {
  return (
    <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
      {children}
    </p>
  );
}
