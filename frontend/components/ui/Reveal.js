"use client";

import { useEffect, useRef, useState } from "react";

/* Reveals its children once they scroll into view.
 *
 * One component rather than a class sprinkled per section, because the
 * observer, the unobserve-after-firing, and the reduced-motion escape hatch
 * all have to be got right in exactly the same way every time.
 *
 * `delay` staggers siblings — pass the index when mapping a list so cards
 * arrive in sequence instead of snapping in as a block.
 *
 * `as` keeps the wrapper semantic: a list of revealed rows should still be
 * <li> elements, not <div>s wrapping <li>s.
 */
export default function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  y = 22,
  className = "",
  ...props
}) {
  const ref = useRef(null);
  // Starts visible so that anything rendered before hydration, or in a
  // browser without IntersectionObserver, is never left invisible.
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Honour the OS setting rather than animating and relying on the global
    // duration override to blunt it.
    // jsdom, and some embedded webviews, have no matchMedia at all — an
    // animation helper must never be the thing that throws.
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    if (typeof IntersectionObserver === "undefined") return;

    // Anything already on screen at mount stays put — reveals are for
    // content the reader scrolls down to, not for the first paint.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) return;

    setShown(false);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          setShown(true);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ease-ease motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : "opacity-0"
      } ${className}`}
      style={{
        transitionDelay: delay ? `${delay}ms` : undefined,
        ...(shown ? null : { transform: `translateY(${y}px)` }),
      }}
      {...props}
    >
      {children}
    </Tag>
  );
}
