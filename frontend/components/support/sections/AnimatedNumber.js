"use client";

import { useLayoutEffect, useRef } from "react";

export default function AnimatedNumber({ value, animate = true }) {
  const element = useRef(null);
  const played = useRef(false);
  const label = value == null ? "—" : Number(value).toLocaleString("th-TH");
  useLayoutEffect(() => {
    const node = element.current;
    if (!node || value == null || !animate || played.current) return;
    played.current = true;
    let frame;
    const start = performance.now();
    // Write before paint and update only this text node, not the dashboard.
    node.textContent = "0";
    function tick(now) {
      const progress = Math.min(Math.max((now - start) / 1100, 0), 1);
      node.textContent = Math.round(
        Number(value) * (1 - Math.pow(1 - progress, 3)),
      ).toLocaleString("th-TH");
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      node.textContent = label;
    };
  }, [value, animate, label]);
  return (
    <>
      <span className="sr-only">{label}</span>
      <span ref={element} data-animated-number aria-hidden="true">
        {label}
      </span>
    </>
  );
}
