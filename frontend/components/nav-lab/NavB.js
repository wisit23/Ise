"use client";

import Link from "next/link";
import {
  AccountMenu,
  Brand,
  CartButton,
  SearchField,
  useScrolledPast,
} from "./NavParts";
import BottomTabs from "./BottomTabs";
import { DISCOVERY } from "./navLabData";

/* VARIANT B — two rows, the second one collapses on scroll.

   Thesis: the top row is the star (brand, a search field with room to
   breathe, cart, account). The second row is lighter and smaller, and it
   scrolls horizontally — so categories can grow without ever crowding the
   header.

   This is where the "collapse" instinct belongs: the row you need while
   *choosing where to look* folds away once you are looking, and the search
   field you need the whole time never moves. */
export default function NavB({ categories }) {
  const collapsed = useScrolledPast(80);

  return (
    <>
      <header className="sticky top-0 z-nav border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-4 px-5">
          <Brand />
          <SearchField className="max-w-[620px] flex-1" />
          <div className="flex shrink-0 items-center gap-1">
            <CartButton />
            <div className="hidden sm:block">
              <AccountMenu />
            </div>
          </div>
        </div>

        {/* Row two. `grid-template-rows` animates cleanly from 0 to auto,
            which max-height cannot do without guessing a number. */}
        <div
          className="hidden overflow-hidden transition-[grid-template-rows,opacity] duration-300 sm:grid"
          style={{
            gridTemplateRows: collapsed ? "0fr" : "1fr",
            opacity: collapsed ? 0 : 1,
          }}
          aria-hidden={collapsed}
        >
          <div className="min-h-0">
            <div className="mx-auto w-full max-w-[1280px] px-5">
              <div className="scrollbar-none flex items-center gap-1 overflow-x-auto border-t border-line py-2">
                {DISCOVERY.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    tabIndex={collapsed ? -1 : 0}
                    className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-100 hover:text-brand-700"
                  >
                    <span
                      className="material-symbols-outlined text-[17px]"
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                ))}

                <span
                  className="mx-2 h-4 w-px shrink-0 bg-line"
                  aria-hidden="true"
                />

                {categories.map((c) => (
                  <Link
                    key={c}
                    href={`/products?category=${encodeURIComponent(c)}`}
                    tabIndex={collapsed ? -1 : 0}
                    className="focus-ring shrink-0 rounded-lg px-3 py-1.5 text-[13px] text-ink-muted transition hover:bg-gray-100 hover:text-gray-900"
                  >
                    {c}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <BottomTabs />
    </>
  );
}
