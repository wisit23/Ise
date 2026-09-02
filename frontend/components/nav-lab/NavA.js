"use client";

import Link from "next/link";
import { AccountMenu, Brand, CartButton, SearchField } from "./NavParts";
import BottomTabs from "./BottomTabs";
import { DISCOVERY } from "./navLabData";

/* VARIANT A — one row.

   Thesis: a buyer only has three ways to browse, so they fit beside the
   search field. Nothing is hidden and nothing moves; the header is the same
   height whether you are at the top of the page or the bottom.

   Cost: on a 1280px screen the search field ends up around 420px wide, and
   there is no room left for a category row. */
export default function NavA() {
  return (
    <>
      <header className="sticky top-0 z-nav border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-4 px-5">
          <Brand />

          <SearchField className="hidden max-w-[460px] flex-1 sm:flex" />

          <nav
            aria-label="สำรวจ"
            className="ml-auto hidden items-center gap-1 lg:flex"
          >
            {DISCOVERY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-brand-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-2">
            <CartButton />
            <AccountMenu />
          </div>
        </div>

        {/* Small screens: search moves to its own row, the rest goes to the
            bottom tab bar. */}
        <div className="border-t border-line px-5 py-2 sm:hidden">
          <SearchField />
        </div>
      </header>

      <BottomTabs />
    </>
  );
}
