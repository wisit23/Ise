"use client";

import React, { useState } from "react";
import ProductCard from "../ProductCard";
import Skeleton from "../ui/Skeleton";

/**
 * FannedHeroCards Component
 *
 * Renders 3 real ProductCards in an interactive fanned arc deck,
 * scaled to prominent dimensions with natural spring physics.
 */
export default function FannedHeroCards({ items = [], loading = false }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (loading) {
    return (
      <div className="relative mx-auto flex h-[500px] w-full max-w-[580px] items-center justify-center">
        <Skeleton className="absolute h-[410px] w-[265px] -rotate-11 -translate-x-24 translate-y-4 rounded-md" />
        <Skeleton className="absolute h-[420px] w-[275px] -translate-y-2 z-10 rounded-md" />
        <Skeleton className="absolute h-[410px] w-[265px] rotate-11 translate-x-24 translate-y-4 rounded-md" />
      </div>
    );
  }

  const products = (items || []).filter((p) => p.media?.length).slice(0, 3);

  if (products.length === 0) {
    return (
      <div className="grid h-[420px] place-items-center rounded-md border border-dashed border-line-strong text-sm text-ink-subtle">
        ยังไม่มีสินค้าให้แสดง
      </div>
    );
  }

  // Calculate dynamic transform and elevation on hover
  const getCardStyle = (index) => {
    const transition = "all 600ms cubic-bezier(0.34, 1.45, 0.64, 1)";

    // Default resting positions (Fanned Arc)
    if (hoveredIndex === null) {
      if (index === 0) {
        return {
          transform: "rotate(-10deg) translate(-105px, 16px) scale(0.97)",
          zIndex: 1,
          transition,
        };
      }
      if (index === 1) {
        return {
          transform: "rotate(0deg) translateY(-10px) scale(1.03)",
          zIndex: 10,
          boxShadow: "0 20px 45px -10px rgba(15, 23, 42, 0.18)",
          transition,
        };
      }
      if (index === 2) {
        return {
          transform: "rotate(10deg) translate(105px, 16px) scale(0.97)",
          zIndex: 2,
          transition,
        };
      }
    }

    // Hovering Card 0 (Left Card)
    if (hoveredIndex === 0) {
      if (index === 0) {
        return {
          transform: "rotate(-2deg) translate(-115px, -26px) scale(1.06)",
          zIndex: 30,
          boxShadow: "0 28px 55px -12px rgba(15, 23, 42, 0.25)",
          transition,
        };
      }
      if (index === 1) {
        return {
          transform: "rotate(6deg) translate(35px, 16px) scale(0.95)",
          zIndex: 5,
          transition,
        };
      }
      if (index === 2) {
        return {
          transform: "rotate(16deg) translate(155px, 28px) scale(0.91)",
          zIndex: 1,
          transition,
        };
      }
    }

    // Hovering Card 1 (Center Card)
    if (hoveredIndex === 1) {
      if (index === 0) {
        return {
          transform: "rotate(-16deg) translate(-155px, 26px) scale(0.92)",
          zIndex: 1,
          transition,
        };
      }
      if (index === 1) {
        return {
          transform: "rotate(0deg) translateY(-28px) scale(1.08)",
          zIndex: 30,
          boxShadow: "0 30px 60px -12px rgba(15, 23, 42, 0.28)",
          transition,
        };
      }
      if (index === 2) {
        return {
          transform: "rotate(16deg) translate(155px, 26px) scale(0.92)",
          zIndex: 1,
          transition,
        };
      }
    }

    // Hovering Card 2 (Right Card)
    if (hoveredIndex === 2) {
      if (index === 0) {
        return {
          transform: "rotate(-16deg) translate(-155px, 28px) scale(0.91)",
          zIndex: 1,
          transition,
        };
      }
      if (index === 1) {
        return {
          transform: "rotate(-6deg) translate(-35px, 16px) scale(0.95)",
          zIndex: 5,
          transition,
        };
      }
      if (index === 2) {
        return {
          transform: "rotate(2deg) translate(115px, -26px) scale(1.06)",
          zIndex: 30,
          boxShadow: "0 28px 55px -12px rgba(15, 23, 42, 0.25)",
          transition,
        };
      }
    }

    return { transition };
  };

  return (
    <div className="relative mx-auto flex h-[520px] w-full max-w-[600px] items-center justify-center select-none">
      {/* Ambient background glow behind the deck */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(circle_at_center,theme(colors.brand.100/.5),transparent_70%)] blur-2xl -z-10"
      />

      {/* 3 Fanned Real Product Cards */}
      {products.map((product, i) => {
        const style = getCardStyle(i);

        return (
          <div
            key={product.id}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={style}
            className="absolute w-[250px] sm:w-[270px] md:w-[280px] will-change-transform drop-shadow-sm"
          >
            <ProductCard product={product} showSeller={true} />
          </div>
        );
      })}
    </div>
  );
}
