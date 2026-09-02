"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AccountMenu, Brand, CartButton, SearchField } from "./NavParts";
import { DISCOVERY } from "./navLabData";

/* VARIANT C — the ClassiAds idea: feature buttons lead, search is folded
   behind an icon and expands over them on click.

   Thesis: with the search field gone, every feature gets a labelled button
   with an icon, right at the top level. Nothing is buried in a menu.

   Cost, and the reason this is here to be judged rather than recommended:
   search is the thing a buyer reaches for most, and it now costs a click and
   a wait for an animation. There is also no bottom tab bar on mobile — the
   pattern is top-bar-only by design — so the same buttons have to survive
   inside 375px.

   Colours and type come from the RE-LOOP tokens, not the reference image, so
   the comparison is about structure rather than palette. */
export default function NavC() {
  const [searchOpen, setSearchOpen] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    function onEscape(e) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        closeRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, []);

  return (
    <header className="sticky top-0 z-nav border-b border-line bg-white/85 backdrop-blur">
      <div className="relative mx-auto flex h-16 w-full max-w-[1280px] items-center gap-2 px-5">
        <Brand />

        <nav
          aria-label="สำรวจ"
          className="scrollbar-none ml-2 flex flex-1 items-center gap-1 overflow-x-auto"
        >
          {DISCOVERY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="focus-ring flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-brand-50 hover:text-brand-700"
            >
              <span
                className="material-symbols-outlined text-[19px]"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
          <Link
            href="/sell"
            className="focus-ring flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-brand-50 hover:text-brand-700"
          >
            <span
              className="material-symbols-outlined text-[19px]"
              aria-hidden="true"
            >
              sell
            </span>
            ลงขาย
          </Link>
        </nav>

        <button
          ref={closeRef}
          onClick={() => setSearchOpen(true)}
          aria-label="เปิดช่องค้นหา"
          aria-expanded={searchOpen}
          className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-brand-700"
        >
          <span
            className="material-symbols-outlined text-[22px]"
            aria-hidden="true"
          >
            search
          </span>
        </button>
        <CartButton />
        <AccountMenu />

        {/* Expanded search covers the whole bar. */}
        {searchOpen && (
          <div className="animate-fade-in absolute inset-0 z-10 flex items-center gap-2 bg-white px-5">
            <SearchField autoFocus className="flex-1" />
            <button
              onClick={() => {
                setSearchOpen(false);
                closeRef.current?.focus();
              }}
              aria-label="ปิดช่องค้นหา"
              className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-600 transition hover:bg-gray-100"
            >
              <span
                className="material-symbols-outlined text-[22px]"
                aria-hidden="true"
              >
                close
              </span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
