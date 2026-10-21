"use client";

import { useRouter } from "next/navigation";

/**
 * A link without an href, so hovering it doesn't pop the browser's URL
 * preview into the bottom-left corner (reported from the cart thumbnails).
 * It still behaves like a link for everything that matters: role="link" and
 * Enter for keyboard/screen-reader users, a plain click navigates in-app,
 * and Ctrl/⌘/Shift-click or a middle click opens a new tab the way a real
 * <a> would. Use it only where the preview was the complaint — a real
 * <Link> is still the right default everywhere else.
 */
export default function QuietLink({ href, className = "", children, ...props }) {
  const router = useRouter();

  function open(newTab) {
    if (newTab) window.open(href, "_blank", "noopener");
    else router.push(href);
  }

  return (
    <span
      role="link"
      tabIndex={0}
      className={`cursor-pointer ${className}`}
      onMouseEnter={() => router.prefetch?.(href)}
      onClick={(e) => open(e.ctrlKey || e.metaKey || e.shiftKey)}
      onAuxClick={(e) => {
        if (e.button === 1) open(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          open(e.ctrlKey || e.metaKey);
        }
      }}
      {...props}
    >
      {children}
    </span>
  );
}
