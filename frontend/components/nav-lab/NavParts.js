"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MY_STUFF } from "./navLabData";

/* Pieces every variant shares, so the comparison is about layout only —
   the brand, the search field, the cart and the account menu are identical
   in all three. */

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="RE-LOOP หน้าแรก"
      className="focus-ring flex shrink-0 items-center gap-2 rounded text-xl font-bold tracking-tight text-brand-600"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
        <span className="material-symbols-outlined text-[18px]">autorenew</span>
      </span>
      {/* The wordmark costs 123px of a 375px row, which left the search input
          42px wide. Below sm the mark alone carries the brand. */}
      <span className="hidden sm:inline">RE-LOOP</span>
    </Link>
  );
}

export function SearchField({ autoFocus = false, onSubmit, className = "" }) {
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(q);
      }}
      className={`flex min-w-0 items-center overflow-hidden rounded-full border border-line-strong bg-white transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 ${className}`}
    >
      {/* The display utility lives on a wrapper, never on the icon span:
          Google's Material Symbols stylesheet loads after Tailwind's and sets
          `display` on .material-symbols-outlined, which silently beats
          `hidden` / `sm:inline` placed directly on the icon. */}
      <span className="hidden pl-4 sm:inline" aria-hidden="true">
        <span className="material-symbols-outlined text-[20px] text-ink-subtle">
          search
        </span>
      </span>
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        aria-label="ค้นหาสินค้า"
        placeholder="ค้นหาแบรนด์ หมวดหมู่ หรือสไตล์…"
        className="min-w-0 flex-1 bg-transparent py-2.5 pl-4 pr-3 text-sm outline-none placeholder:text-ink-subtle sm:pl-3"
      />
      {/* At 375px the word "ค้นหา" ate so much of the row that the input
          showed a single character. Below sm the button carries the icon
          instead; the label comes back as soon as there is room. */}
      <button
        type="submit"
        aria-label="ค้นหา"
        className="flex shrink-0 items-center gap-1 self-stretch bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 sm:px-5"
      >
        <span className="sm:hidden" aria-hidden="true">
          <span className="material-symbols-outlined text-[18px]">search</span>
        </span>
        <span className="hidden sm:inline">ค้นหา</span>
      </button>
    </form>
  );
}

export function CartButton({ count = 2 }) {
  return (
    <Link
      href="/cart"
      aria-label={`ตะกร้า มี ${count} รายการ`}
      className="focus-ring relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-brand-700"
    >
      <span
        className="material-symbols-outlined text-[22px]"
        aria-hidden="true"
      >
        shopping_cart
      </span>
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

/* The whole point of the redesign: this menu holds "my stuff" plus a single
   mode-switch row — not the twelve mixed entries the live NavBar has today. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEscape(e) {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="เมนูบัญชี"
        aria-haspopup="menu"
        aria-expanded={open}
        className="focus-ring grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 ring-2 ring-transparent transition hover:ring-brand-200"
      >
        อ
      </button>

      {open && (
        <div
          role="menu"
          className="animate-dropdown-in absolute right-0 top-11 w-60 overflow-hidden rounded-xl border border-line bg-white py-2 shadow-lg"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-gray-900">
              อชิรวิชญ์
            </p>
            <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              ผู้ซื้อ
            </span>
          </div>

          {MY_STUFF.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              <span
                className="material-symbols-outlined text-[18px] text-ink-subtle"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}

          {/* One row, not four. Changing role means changing app, the way
              /workspace already works for staff. */}
          <div className="mt-1 border-t border-line pt-1">
            <Link
              href="/seller/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
            >
              <span
                className="material-symbols-outlined text-[18px]"
                aria-hidden="true"
              >
                storefront
              </span>
              สลับไปโหมดผู้ขาย
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** True once the page has scrolled past `offset`. Drives variant B's collapse. */
export function useScrolledPast(offset = 80) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > offset);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);
  return past;
}
