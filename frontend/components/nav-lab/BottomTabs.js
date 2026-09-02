"use client";

import Link from "next/link";
import { MOBILE_TABS } from "./navLabData";

/* The real answer to "many features on a small screen".

   Five tabs on a 375px screen gives each one 75px, against the 44px a thumb
   needs — room to spare. A sixth or seventh is where mis-taps start.
   Icon 24px + label 10px + 56px bar is the size that stays legible without
   turning into a wall of text. */
export default function BottomTabs({ active = "/products" }) {
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-nav border-t border-line bg-white/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-14">
        {MOBILE_TABS.map((tab) => {
          const isActive = tab.href === active;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`focus-ring relative flex h-full flex-col items-center justify-center gap-0.5 transition ${
                  isActive ? "text-brand-600" : "text-ink-muted"
                }`}
              >
                <span className="relative">
                  <span
                    className="material-symbols-outlined text-[24px] leading-none"
                    aria-hidden="true"
                    style={{
                      fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                    }}
                  >
                    {tab.icon}
                  </span>
                  {tab.badge && (
                    <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
                      2
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-none">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
